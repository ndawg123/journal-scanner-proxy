require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

// ── Configuration ──────────────────────────────────────────────────────────────
const INPUT_DIR = path.join(__dirname, 'input');
const DONE_DIR = path.join(__dirname, 'done');
const OBSIDIAN_JOURNAL_DIR = '/Users/nathanbullock/Documents/My Vault/Personal/Journals';
const PROGRESS_FILE = path.join(__dirname, 'progress.json');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Helpers ────────────────────────────────────────────────────────────────────

function journalLabel(filename) {
  // Extract date prefix if present (e.g. "1987-06-15_001.jpg" → "1987-06-15")
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
  const content = `---\ndate: ${date}\ntags: [journal, handwritten]\n---\n\n${text.trim()}\n\n[[Journal Hub]]\n`;
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
            text: `You are transcribing a handwritten personal journal page. Transcribe it accurately, preserving the author's voice, spelling, and punctuation.

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
  // Strip markdown code fences if Claude wraps the JSON
  const jsonStr = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(jsonStr);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set. Add it to journal-scanner/.env');
    process.exit(1);
  }

  const allFiles = fs.readdirSync(INPUT_DIR)
    .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (allFiles.length === 0) {
    console.log('No images found in the input/ folder. Add your journal page photos and run again.');
    return;
  }

  // Show which journal(s) are being processed
  const labels = [...new Set(allFiles.map(journalLabel).filter(Boolean))];
  if (labels.length > 0) {
    console.log(`Journal(s) detected: ${labels.join(', ')}`);
  }

  let state = loadProgress();
  let { pendingEntry } = state;

  const startIndex = state.lastCompletedPage + 1;
  const remaining = allFiles.slice(startIndex);

  if (remaining.length === 0) {
    console.log('All pages already processed. Delete progress.json to start over.');
    return;
  }

  console.log(`Found ${allFiles.length} pages. Starting from page ${startIndex + 1}.\n`);

  let currentLabel = null;

  for (let i = 0; i < remaining.length; i++) {
    const file = remaining[i];
    const pageNum = startIndex + i + 1;
    const imagePath = path.join(INPUT_DIR, file);
    const label = journalLabel(file);

    // Print a header when we move into a new journal
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
    console.log('It has been saved to progress.json. Add more pages to the input/ folder and run again, or delete progress.json to flush it as-is.');
  } else {
    console.log('\nDone! All journal entries written to Obsidian.');
    console.log('Archiving processed images to done/...');
    for (const file of allFiles) {
      archivePage(file);
    }
    fs.unlinkSync(PROGRESS_FILE);
    console.log(`Moved ${allFiles.length} pages to done/. input/ is clear for the next journal.`);
  }
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
