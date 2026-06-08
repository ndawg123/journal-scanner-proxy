require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

// ── Configuration ──────────────────────────────────────────────────────────────
const INPUT_DIR = path.join(__dirname, 'input-scripture');
const DONE_DIR = path.join(__dirname, 'done-scripture');
const OBSIDIAN_JOURNAL_DIR = '/Users/nathanbullock/Documents/My Vault/Personal/Scripture Study';
const PROGRESS_FILE = path.join(__dirname, 'scripture-progress.json');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Helpers ────────────────────────────────────────────────────────────────────

function journalLabel(filename) {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }
  return { lastCompletedPage: -1, pendingEntry: null };
}

function saveProgress(state) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(state, null, 2));
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];

function resolveOutputPath(date) {
  const [year, month] = date.split('-');
  const monthFolder = `${month} - ${MONTH_NAMES[parseInt(month) - 1]}`;
  const dir = path.join(OBSIDIAN_JOURNAL_DIR, year, monthFolder);
  fs.mkdirSync(dir, { recursive: true });
  let filePath = path.join(dir, `${date}.md`);
  let suffix = 2;
  while (fs.existsSync(filePath)) {
    filePath = path.join(dir, `${date}-${suffix}.md`);
    suffix++;
  }
  return filePath;
}

function writeEntry(date, text) {
  const filePath = resolveOutputPath(date);
  const content = `---\ndate: ${date}\ntags: [scripture, handwritten]\n---\n\n${text.trim()}\n\n[[Scripture Study Hub]]\n`;
  fs.writeFileSync(filePath, content, 'utf8');
  return path.basename(filePath);
}

function archivePage(filename) {
  fs.mkdirSync(DONE_DIR, { recursive: true });
  fs.renameSync(path.join(INPUT_DIR, filename), path.join(DONE_DIR, filename));
}

async function processPage(imageFile) {
  const imageData = fs.readFileSync(imageFile);
  const base64 = imageData.toString('base64');
  const ext = path.extname(imageFile).toLowerCase();
  const mediaType = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: `You are transcribing a handwritten scripture study journal page. Transcribe it accurately, preserving the author's voice, spelling, and punctuation.

This page may contain:
- Multiple journal entries from different dates on the same page
- An entry that continues from the previous page (no date at the top — it just picks up mid-sentence)
- An entry that runs off the bottom and continues on the next page

Return ONLY a JSON object in this exact format — no markdown, no explanation, just the JSON:

{
  "is_continuation": <true if this page begins mid-entry with no new date, false otherwise>,
  "entries": [
    {
      "date": "<YYYY-MM-DD format, e.g. 2019-06-03>",
      "text": "<full transcribed text of this entry or entry segment>",
      "continues": <true if this entry runs off the bottom of the page, false if it ends on this page>
    }
  ]
}

If is_continuation is true, the first item in entries should have "date": null.
If you cannot confidently read a date, make your best guess based on context clues. Do not skip any text.`,
          },
        ],
      },
    ],
  });

  const raw = response.content[0].text.trim();
  const jsonStr = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(jsonStr);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set. Add it to ~/Documents/Journal Digitization/.env');
    process.exit(1);
  }

  fs.mkdirSync(INPUT_DIR, { recursive: true });

  const allFiles = fs.readdirSync(INPUT_DIR)
    .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (allFiles.length === 0) {
    console.log('No images found in the input-scripture/ folder. Add your scripture journal photos and run again.');
    return;
  }

  const labels = [...new Set(allFiles.map(journalLabel).filter(Boolean))];
  if (labels.length > 0) {
    console.log(`Journal(s) detected: ${labels.join(', ')}`);
  }

  let state = loadProgress();
  let { pendingEntry } = state;

  const startIndex = state.lastCompletedPage + 1;
  const remaining = allFiles.slice(startIndex);

  if (remaining.length === 0) {
    console.log('All pages already processed. Delete scripture-progress.json to start over.');
    return;
  }

  console.log(`Found ${allFiles.length} pages. Starting from page ${startIndex + 1}.\n`);

  let currentLabel = null;

  for (let i = 0; i < remaining.length; i++) {
    const file = remaining[i];
    const pageNum = startIndex + i + 1;
    const imagePath = path.join(INPUT_DIR, file);
    const label = journalLabel(file);

    if (label && label !== currentLabel) {
      currentLabel = label;
      console.log(`\n── Journal started ${label} ──`);
    }

    process.stdout.write(`  Page ${pageNum} of ${allFiles.length} (${file})... `);

    let parsed;
    try {
      parsed = await processPage(imagePath);
    } catch (err) {
      console.error(`\nFailed on ${file}: ${err.message}`);
      console.error('Fix the issue and run again — progress is saved up to the previous page.');
      process.exit(1);
    }

    const written = [];

    if (parsed.is_continuation && pendingEntry) {
      const continuedText = parsed.entries[0]?.text || '';
      pendingEntry.text += '\n\n' + continuedText;

      if (!parsed.entries[0]?.continues) {
        const filename = writeEntry(pendingEntry.date, pendingEntry.text);
        written.push(filename);
        pendingEntry = null;
      }

      const rest = parsed.entries.slice(1);
      for (const entry of rest) {
        if (entry.continues) {
          pendingEntry = { date: entry.date, text: entry.text };
        } else {
          const filename = writeEntry(entry.date, entry.text);
          written.push(filename);
        }
      }
    } else {
      for (const entry of parsed.entries) {
        if (!entry.date) continue;
        if (entry.continues) {
          pendingEntry = { date: entry.date, text: entry.text };
        } else {
          const filename = writeEntry(entry.date, entry.text);
          written.push(filename);
        }
      }
    }

    if (written.length > 0) {
      console.log(`✓ Wrote: ${written.join(', ')}`);
    } else if (pendingEntry) {
      console.log(`→ Entry for ${pendingEntry.date} continues on next page`);
    } else {
      console.log(`✓ (no complete entries yet)`);
    }

    state = { lastCompletedPage: startIndex + i, pendingEntry };
    saveProgress(state);
  }

  if (pendingEntry) {
    console.log(`\nNote: The last entry (${pendingEntry.date}) appears to continue beyond the final page.`);
    console.log('It has been saved to scripture-progress.json. Add more pages to input-scripture/ and run again, or delete scripture-progress.json to flush it as-is.');
  } else {
    console.log('\nDone! All scripture journal entries written to Obsidian.');
    console.log('Archiving processed images to done-scripture/...');
    for (const file of allFiles) {
      archivePage(file);
    }
    fs.unlinkSync(PROGRESS_FILE);
    console.log(`Moved ${allFiles.length} pages to done-scripture/. input-scripture/ is clear for the next journal.`);
  }
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
