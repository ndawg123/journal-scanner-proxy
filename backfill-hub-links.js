// One-time script: append [[Journal Hub]] to existing journal entries that predate the hub-link change.
// Idempotent — safe to re-run; skips files that already contain the link.
const fs = require('fs');
const path = require('path');

const JOURNALS_DIR = '/Users/nathanbullock/Documents/My Vault/Personal/Journals';
const LINK = '[[Journal Hub]]';
const SKIP_FILES = new Set(['Journal Hub.md', 'Journal Digitization Guide.md']);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.md') && !SKIP_FILES.has(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = walk(JOURNALS_DIR);
let updated = 0;
let skipped = 0;

for (const filePath of files) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(LINK)) {
    skipped++;
    continue;
  }
  const newContent = content.endsWith('\n') ? `${content}\n${LINK}\n` : `${content}\n\n${LINK}\n`;
  fs.writeFileSync(filePath, newContent, 'utf8');
  updated++;
}

console.log(`Updated: ${updated}`);
console.log(`Already linked (skipped): ${skipped}`);
console.log(`Total entries scanned: ${files.length}`);
