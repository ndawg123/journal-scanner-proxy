const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── Configuration ──────────────────────────────────────────────────────────────
const DB_PATH = '/Users/nathanbullock/Library/Group Containers/5U8NS4GX82.dayoneapp2/Data/Documents/DayOne.sqlite';
const OBSIDIAN_JOURNAL_DIR = '/Users/nathanbullock/Documents/My Vault/Personal/Journals';
const STATE_FILE = path.join(__dirname, 'dayone-sync-state.json');

// ── Helpers ────────────────────────────────────────────────────────────────────

function loadSyncedUUIDs() {
  if (fs.existsSync(STATE_FILE)) {
    return new Set(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')).syncedUUIDs || []);
  }
  return new Set();
}

function saveSyncedUUIDs(uuids) {
  fs.writeFileSync(STATE_FILE, JSON.stringify({ syncedUUIDs: [...uuids] }, null, 2));
}

function queryEntries() {
  const sql = `
    SELECT
      e.ZGREGORIANYEAR  AS yr,
      e.ZGREGORIANMONTH AS mo,
      e.ZGREGORIANDAY   AS dy,
      e.ZUUID           AS uuid,
      e.ZSTARRED        AS starred,
      e.ZMARKDOWNTEXT   AS text,
      GROUP_CONCAT(t.ZNAME, '|||') AS tags
    FROM ZENTRY e
    LEFT JOIN Z_17TAGS jt ON jt.Z_17ENTRIES = e.Z_PK
    LEFT JOIN ZTAG t      ON t.Z_PK = jt.Z_66TAGS1
    WHERE e.ZMARKDOWNTEXT IS NOT NULL AND e.ZMARKDOWNTEXT != ''
    GROUP BY e.Z_PK
    ORDER BY e.ZGREGORIANYEAR, e.ZGREGORIANMONTH, e.ZGREGORIANDAY, e.ZCREATIONDATE
  `.trim().replace(/\s+/g, ' ');

  const result = execSync(
    `sqlite3 "${DB_PATH}" ".mode json" "${sql.replace(/"/g, '\\"')}"`,
    { maxBuffer: 50 * 1024 * 1024 }
  );
  return JSON.parse(result.toString());
}

function formatDate(yr, mo, dy) {
  return `${yr}-${String(mo).padStart(2, '0')}-${String(dy).padStart(2, '0')}`;
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

function hasMediaAttachment(text) {
  return /!\[\]\(dayone-moment:\/(photo|video)\/[A-Z0-9]+\)/.test(text);
}

function buildFrontmatter(date, uuid, starred, tags) {
  const tagList = ['journal', 'day-one'];
  if (starred) tagList.push('starred');
  if (tags) {
    tags.split('|||').forEach(t => {
      const clean = t.trim();
      if (clean) tagList.push(clean.toLowerCase().replace(/\s+/g, '-'));
    });
  }
  return `---\ndate: ${date}\ntags: [${tagList.join(', ')}]\ndayone-id: ${uuid}\n---`;
}

// ── Main ───────────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error('Day One database not found. Make sure Day One is installed.');
    process.exit(1);
  }

  const syncedUUIDs = loadSyncedUUIDs();
  let entries;

  try {
    entries = queryEntries();
  } catch (err) {
    console.error('Failed to read Day One database:', err.message);
    console.error('Try closing Day One and running again if this persists.');
    process.exit(1);
  }

  const newEntries = entries.filter(e => !syncedUUIDs.has(e.uuid));

  if (newEntries.length === 0) {
    console.log(`All ${entries.length} Day One entries already synced. Nothing to do.`);
    return;
  }

  console.log(`Found ${newEntries.length} new entries to sync (${entries.length - newEntries.length} already done).\n`);

  let written = 0;
  let skipped = 0;

  for (const entry of newEntries) {
    const date = formatDate(entry.yr, entry.mo, entry.dy);
    const rawText = entry.text || '';

    if (!rawText.trim() || hasMediaAttachment(rawText)) {
      skipped++;
      syncedUUIDs.add(entry.uuid);
      continue;
    }

    const frontmatter = buildFrontmatter(date, entry.uuid, entry.starred, entry.tags);
    const content = `${frontmatter}\n\n${rawText.trim()}\n`;
    const filePath = resolveOutputPath(date);
    const filename = path.basename(filePath);

    fs.writeFileSync(filePath, content, 'utf8');
    syncedUUIDs.add(entry.uuid);
    console.log(`✓ ${date} → ${filename}`);
    written++;
  }

  saveSyncedUUIDs(syncedUUIDs);

  console.log(`\nDone. Wrote ${written} entries${skipped ? `, skipped ${skipped} empty` : ''}.`);
  console.log('Run again anytime to sync new Day One entries.');
}

main();
