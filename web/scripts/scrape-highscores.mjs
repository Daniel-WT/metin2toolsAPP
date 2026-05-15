#!/usr/bin/env node
// ============================================================
// Metin2 Highscore Scraper — runs via GitHub Actions
//
// Flow (all on Wednesday):
//   04:00 UTC — "before" scan: snapshot before transfers
//   09:00-21:00 UTC (hourly) — "after" logic:
//     1. Quick-check: did Update timestamps change since "before"?
//        No → exit (rankings not refreshed yet)
//     2. No "after" snapshot yet → full scrape, detect transfers
//     3. "after" exists, timestamps changed since last "after"
//        → re-scrape, update names in transfers.json
//     4. hour >= 20 UTC → force final scan regardless
// ============================================================

const SERVERS = [
  { id: 51,  name: 'Romania',          domain: 'ro.metin2.gameforge.com' },
  { id: 54,  name: 'Tara Romaneasca',  domain: 'ro.metin2.gameforge.com' },
  { id: 700, name: 'Magyarorszag',     domain: 'ro.metin2.gameforge.com' },
  { id: 701, name: 'Cesko',            domain: 'ro.metin2.gameforge.com' },
  { id: 702, name: 'Polska',           domain: 'ro.metin2.gameforge.com' },
];

const CHAMP_LEVEL_THRESHOLD = 5;
const PLAYERS_PER_PAGE = 10;
const CLASSES = [
  { id: 0, name: 'Razboinic' },
  { id: 1, name: 'Ninja' },
  { id: 2, name: 'Sura' },
  { id: 3, name: 'Saman' },
  { id: 4, name: 'Lycan' },
];
const REQUEST_DELAY_MS = 800;

import fs from 'fs';
import path from 'path';
import https from 'https';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'M2Tools-Scraper/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPage(res.headers.location).then(resolve, reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// HTML: <td class="rank-td-X-1">RANK</td> ... <td class="rank-td-X-5">EXP / CHAMPEXP</td>
function parsePlayers(html) {
  const players = [];
  const rowRegex = /<td\s+class="rank-td-\d+-1">\s*(\d+)\s*<\/td>\s*<td\s+class="rank-td-\d+-2">\s*([^<]+?)\s*<\/td>\s*<td\s+class="rank-td-\d+-3">.*?alt="([^"]*)".*?<\/td>\s*<td\s+class="rank-td-\d+-4">\s*([\d]+)\s*\/\s*([\d]+)\s*<\/td>\s*<td\s+class="rank-td-\d+-5">\s*([\d]+)\s*\/\s*([\d]+)\s*<\/td>/gis;
  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    players.push({
      rank: parseInt(match[1]),
      name: match[2].trim(),
      kingdom: match[3].trim(),
      level: parseInt(match[4]),
      champLevel: parseInt(match[5]),
      exp: parseInt(match[6]),
      champExp: parseInt(match[7]),
    });
  }
  return players;
}

// Parse "Update: DD.MM.YYYY HH:MM:SS" from page
function parseUpdateTime(html) {
  const m = html.match(/ranks-update-time[^>]*>[^<]*?(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2}:\d{2})/i);
  if (!m) return null;
  const [dd, mm, yyyy] = m[1].split('.');
  const d = new Date(`${yyyy}-${mm}-${dd}T${m[2]}`);
  return isNaN(d.getTime()) ? null : d;
}

// Quick check: just fetch the first page to get the Update timestamp
async function quickCheckTimestamp(server) {
  const url = `https://${server.domain}/main/highscore/${server.id}/-1/0/`;
  const html = await fetchPage(url);
  const t = parseUpdateTime(html);
  return t ? t.toISOString() : null;
}

// Scrape one class from one server
async function scrapeClass(server, cls) {
  const players = [];
  let offset = 0, pageNum = 0, consecutiveEmpty = 0, updateTime = null;

  while (true) {
    const url = `https://${server.domain}/main/highscore/${server.id}/${cls.id}/${offset}/`;
    try {
      const html = await fetchPage(url);
      if (pageNum === 0) updateTime = parseUpdateTime(html);
      const pagePlayers = parsePlayers(html);
      if (pagePlayers.length === 0) {
        if (++consecutiveEmpty >= 3) break;
      } else {
        consecutiveEmpty = 0;
        players.push(...pagePlayers.map(p => ({ ...p, class: cls.name })));
        const last = pagePlayers[pagePlayers.length - 1];
        if (last.champLevel < CHAMP_LEVEL_THRESHOLD) {
          console.log(`      [${cls.name}] Reached CL${last.champLevel} at rank ${last.rank}. Stopping.`);
          break;
        }
      }
    } catch (err) {
      console.error(`      [${cls.name}] Error page ${pageNum}: ${err.message}`);
      if (++consecutiveEmpty >= 3) break;
    }
    pageNum++;
    offset = pageNum * PLAYERS_PER_PAGE + 1;
    await sleep(REQUEST_DELAY_MS);
    if (pageNum >= 200) break;
  }

  return { players, updateTime };
}

// Full scrape of a server — iterates all 5 classes
async function scrapeServer(server) {
  console.log(`  Scraping ${server.name} (ID: ${server.id})...`);
  const allPlayers = [];
  let serverUpdateTime = null;

  for (const cls of CLASSES) {
    console.log(`    [${cls.name}]`);
    const { players, updateTime } = await scrapeClass(server, cls);
    if (updateTime && !serverUpdateTime) {
      serverUpdateTime = updateTime;
      console.log(`    Rankings updated: ${serverUpdateTime.toISOString()}`);
    }
    allPlayers.push(...players);
    await sleep(500);
  }

  const filtered = allPlayers.filter(p => p.champLevel >= CHAMP_LEVEL_THRESHOLD);
  console.log(`    ${filtered.length} players with CL >= ${CHAMP_LEVEL_THRESHOLD}`);
  return { players: filtered, updateTime: serverUpdateTime ? serverUpdateTime.toISOString() : null };
}

function getPlayers(d) { return Array.isArray(d) ? d : (d && d.players) || []; }
function getUpdateTime(d) { return (d && d.updateTime) || null; }
// Key: class + level + champLevel — Lycan CL30 ≠ Saman CL30.
// Fallback '' handles snapshots scraped before class was added.
function statKeyBase(p) { return `${p.class || ''}|${p.level}|${p.champLevel}`; }

// Confidence score (0-100) based on champExp delta.
// champExp can only increase between scans — negative delta means impossible match.
function champExpConfidence(before, after) {
  const delta = after.champExp - before.champExp;
  if (delta < 0) return 0;             // champExp can't decrease — impossible
  if (delta === 0) return 100;          // identical — certain
  if (delta < 50_000)   return 97;     // tiny gain — near certain
  if (delta < 500_000)  return 72;     // moderate session — possible
  if (delta < 2_000_000) return 50;    // large session — uncertain
  return 15;                            // very large delta — likely different player
}

// Returns true if the match is ambiguous: top two candidates are within 5% confidence.
// In that case, we can't reliably pick one — skip to avoid false positives.
function isAmbiguous(scored) {
  if (scored.length < 2) return false;
  return (scored[0].conf - scored[1].conf) < 5;
}

// Detect transfers between before/after snapshots
function detectTransfers(beforeSnap, afterSnap) {
  const transfers = [];
  const beforeByName = {};
  const afterByName = {};
  for (const [srv, data] of Object.entries(beforeSnap)) {
    for (const p of getPlayers(data)) beforeByName[p.name] = { server: srv, ...p };
  }
  for (const [srv, data] of Object.entries(afterSnap)) {
    for (const p of getPlayers(data)) afterByName[p.name] = { server: srv, ...p };
  }

  const matched = new Set();

  // Pass 1: exact name on different server → definitive transfer (no stats needed)
  for (const [name, after] of Object.entries(afterByName)) {
    const before = beforeByName[name];
    if (before && before.server !== after.server) {
      const delta = after.champExp - before.champExp;
      if (delta < 0) continue;
      transfers.push({
        name, from: before.server, to: after.server,
        level: after.level, champLevel: after.champLevel,
        class: after.class,
        exp: after.exp, champExp: after.champExp,
        champExpBefore: before.champExp,
        kingdom: after.kingdom,
        rankBefore: before.rank, rankAfter: after.rank,
        champExpDelta: delta,
      });
      matched.add(name);
    }
  }

  // Unmatched pools
  const disappeared = [];
  for (const [name, b] of Object.entries(beforeByName)) {
    if (!afterByName[name] && !matched.has(name)) disappeared.push(b);
  }
  const appeared = [];
  for (const [name, a] of Object.entries(afterByName)) {
    if (!beforeByName[name] && !matched.has(name)) appeared.push(a);
  }

  // Pass 2: same-server name changes FIRST.
  // Race cannot change, so statKeyBase (class|level|CL) guarantees a Lycan
  // only matches a Lycan. Running before cross-server prevents a renamed player
  // from also appearing as a transfer.
  const nameChanges = [];
  const usedDisappearedIdx = new Set();
  const usedAppearedIdx = new Set();

  const bySrvStats = {};
  disappeared.forEach((p, i) => {
    const key = p.server + '|' + statKeyBase(p);
    if (!bySrvStats[key]) bySrvStats[key] = [];
    bySrvStats[key].push({ p, i });
  });

  const MIN_CONF_NC = 92;
  appeared.forEach((ap, j) => {
    const key = ap.server + '|' + statKeyBase(ap);
    const candidates = (bySrvStats[key] || []);
    if (candidates.length === 0) return;
    const scored = candidates
      // Kingdom check: same server → kingdom cannot change.
      // Only reject if both have kingdom data AND they differ.
      .filter(item => !item.p.kingdom || !ap.kingdom || item.p.kingdom === ap.kingdom)
      .map(item => ({ item, conf: champExpConfidence(item.p, ap) }))
      .filter(x => x.conf >= MIN_CONF_NC)
      .sort((a, b) => b.conf - a.conf);
    if (scored.length === 0) return;
    if (isAmbiguous(scored.map(x => ({ conf: x.conf })))) return;
    const best = scored[0];
    bySrvStats[key].splice(bySrvStats[key].indexOf(best.item), 1);
    usedDisappearedIdx.add(best.item.i);
    usedAppearedIdx.add(j);
    nameChanges.push({
      name: best.item.p.name, nameAfter: ap.name,
      server: ap.server,
      level: ap.level, champLevel: ap.champLevel,
      rank: ap.rank,
      matchConfidence: best.conf,
      champExpDelta: ap.champExp - best.item.p.champExp,
      nameChange: true,
    });
  });

  // Pass 3: cross-server stat matching — only players NOT matched as name changes.
  // statKeyBase includes class, so cross-race matches are impossible when class data exists.
  const disappearedForXfer = disappeared.filter((_, i) => !usedDisappearedIdx.has(i));
  const appearedForXfer = appeared.filter((_, j) => !usedAppearedIdx.has(j));

  const disappearedByStats = {};
  for (const p of disappearedForXfer) {
    const key = statKeyBase(p);
    if (!disappearedByStats[key]) disappearedByStats[key] = [];
    disappearedByStats[key].push(p);
  }

  const MIN_CONF = 85;
  for (const ap of appearedForXfer) {
    const key = statKeyBase(ap);
    const candidates = (disappearedByStats[key] || []).filter(c => c.server !== ap.server);
    if (candidates.length === 0) continue;

    const scored = candidates
      .map(c => ({ c, conf: champExpConfidence(c, ap) }))
      .filter(x => x.conf >= MIN_CONF)
      .sort((a, b) => b.conf - a.conf);

    if (scored.length === 0) continue;
    if (isAmbiguous(scored)) continue;

    const best = scored[0];
    const dp = best.c;
    disappearedByStats[key].splice(disappearedByStats[key].indexOf(dp), 1);

    transfers.push({
      name: dp.name, nameAfter: ap.name,
      from: dp.server, to: ap.server,
      level: ap.level, champLevel: ap.champLevel,
      class: ap.class,
      exp: ap.exp, champExp: ap.champExp,
      champExpBefore: dp.champExp,
      kingdom: ap.kingdom,
      rankBefore: dp.rank, rankAfter: ap.rank,
      matchedByStats: true,
      matchConfidence: best.conf,
      champExpDelta: ap.champExp - dp.champExp,
    });
  }

  transfers.sort((a, b) => b.champLevel - a.champLevel || a.name.localeCompare(b.name));
  nameChanges.sort((a, b) => b.champLevel - a.champLevel || a.name.localeCompare(b.name));
  return { transfers, nameChanges };
}

// Update transfer names using a newer snapshot
function updateNames(transfers, latestSnap) {
  // Build lookup: statKey+server → player name (from latest snapshot)
  const latestLookup = {};
  for (const [srv, data] of Object.entries(latestSnap)) {
    for (const p of getPlayers(data)) {
      latestLookup[statKeyBase(p) + '|' + srv] = p;
    }
  }

  let updated = 0;
  for (const t of transfers) {
    // For stat-matched transfers: check if the temp name is now a real name
    if (t.matchedByStats && t.nameAfter) {
      const key = statKeyBase(t) + '|' + t.to;
      const latest = latestLookup[key];
      if (latest && latest.name !== t.nameAfter && !/^\d{8,}/.test(latest.name)) {
        console.log(`  Name fixed: "${t.nameAfter}" → "${latest.name}" (on ${t.to})`);
        t.nameAfter = latest.name;
        t.rankAfter = latest.rank;
        if (latest.name === t.name) {
          // They kept their original name
          delete t.nameAfter;
          delete t.matchedByStats;
        }
        updated++;
      }
    }

    // For all transfers: update current rank from latest data
    const key = statKeyBase(t) + '|' + t.to;
    const latest = latestLookup[key];
    if (latest) t.rankAfter = latest.rank;
  }
  return updated;
}

// ──── HELPERS ────
const outDir = path.resolve('data/snapshots');
const transfersFile = path.resolve('data/transfers.json');

function findFile(prefix) {
  const files = fs.readdirSync(outDir).filter(f => f.startsWith(prefix) && f.endsWith('.json')).sort().reverse();
  return files.length > 0 ? files[0] : null;
}

function loadSnapshot(filename) {
  return JSON.parse(fs.readFileSync(path.join(outDir, filename), 'utf8'));
}

function saveSnapshot(filename, data) {
  fs.writeFileSync(path.join(outDir, filename), JSON.stringify(data, null, 2));
  console.log(`Snapshot saved: ${filename}`);
}

function loadTransfers() {
  if (fs.existsSync(transfersFile)) {
    try { return JSON.parse(fs.readFileSync(transfersFile, 'utf8')); } catch(e) {}
  }
  return { lastUpdated: null, transfers: [], history: [] };
}

function saveTransfers(data) {
  fs.writeFileSync(transfersFile, JSON.stringify(data, null, 2));
  console.log('Transfer data saved.');
}

// ──── MAIN ────
async function main() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const hourUTC = now.getUTCHours();
  const dayOfWeek = now.getUTCDay();

  fs.mkdirSync(outDir, { recursive: true });

  // "before" mode can be triggered explicitly by worker (SCRAPE_MODE=before) or by cron schedule
  const beforeFile = findFile('before-' + dateStr);
  const forceBefore = process.env.SCRAPE_MODE === 'before';
  const isBefore = (forceBefore && !beforeFile) || (dayOfWeek === 3 && hourUTC < 8 && !beforeFile);
  const isFinalScan = hourUTC >= 20;

  console.log(`=== Metin2 Highscore Scraper ===`);
  console.log(`Date: ${dateStr} ${String(hourUTC).padStart(2,'0')}:00 UTC`);
  console.log(`Mode: ${isBefore ? 'BEFORE' : isFinalScan ? 'FINAL' : 'AFTER'}`);
  console.log(`CL threshold: >= ${CHAMP_LEVEL_THRESHOLD}\n`);

  // ════════════════════════════════════════
  // MODE: BEFORE — save pre-transfer snapshot
  // ════════════════════════════════════════
  if (isBefore) {
    const snapshot = {};
    for (const server of SERVERS) {
      snapshot[server.name] = await scrapeServer(server);
      await sleep(1000);
    }
    snapshot._meta = { savedAt: now.toISOString(), type: 'before' };
    saveSnapshot(`before-${dateStr}.json`, snapshot);
    fs.writeFileSync(path.resolve('data/snapshot.json'), JSON.stringify(snapshot, null, 2));
    console.log('Latest snapshot saved to data/snapshot.json');
    const total = Object.entries(snapshot).filter(([k]) => k !== '_meta').reduce((s, [, d]) => s + getPlayers(d).length, 0);
    console.log(`Total players: ${total}`);
    cleanup();
    const fbUrlB = process.env.FB_DATABASE_URL;
    if (fbUrlB) {
      const fbBaseB = fbUrlB.replace(/\/$/, '');
      try {
        await fetch(fbBaseB + '/meta/autoScrape.json', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'before', status: 'done', savedAt: now.toISOString(), triggeredAt: Date.now() })
        });
        await fetch(fbBaseB + '/meta/snapshotRefresh.json', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Date.now())
        });
      } catch(e) { console.log('Firebase notify error:', e.message); }
    }
    return;
  }

  // ════════════════════════════════════════
  // MODE: AFTER — detect transfers + update names
  // ════════════════════════════════════════

  // Check if server has been online long enough (1 hour) before scraping
  const forceAfter = process.env.FORCE_AFTER === 'true';
  if (forceAfter) {
    console.log('⚡ FORCE_AFTER=true — skipping serverOnlineAt check.\n');
  } else {
    const fbUrl = process.env.FB_DATABASE_URL;
    if (fbUrl) {
      try {
        const onlineRes = await fetchPage(fbUrl.replace(/\/$/, '') + '/serverStatus/_serverOnlineAt.json');
        const serverOnlineAt = JSON.parse(onlineRes);
        if (serverOnlineAt) {
          const onlineDate = new Date(serverOnlineAt);
          const msSinceOnline = Date.now() - serverOnlineAt;
          const hoursSinceOnline = (msSinceOnline / 3600000).toFixed(1);
          console.log(`Server came online at: ${onlineDate.toISOString()} (${hoursSinceOnline}h ago)`);

          if (msSinceOnline < 3600000) {
            console.log(`⏳ Server online < 1 hour. Postponing scrape. Will retry next hour.`);
            return;
          }
          console.log(`✓ Server online > 1 hour. Proceeding.\n`);
        } else {
          console.log('⚠ No serverOnlineAt timestamp — monitoring may not have run. Proceeding (timestamp check will verify rankings).\n');
        }
      } catch(e) {
        console.log(`⚠ Could not read serverOnlineAt: ${e.message}. Continuing anyway.`);
      }
    } else {
      console.log('⚠ FB_DATABASE_URL not set. Skipping server online check.');
    }
  }

  // Find "before" snapshot
  const beforeName = findFile('before-');
  if (!beforeName) {
    console.log('⚠ No "before" snapshot found. Nothing to compare against. Exiting.');
    return;
  }
  const beforeSnap = loadSnapshot(beforeName);
  console.log(`Reference: ${beforeName}`);

  // Get "before" update timestamps
  const beforeTimes = {};
  for (const [srv, data] of Object.entries(beforeSnap)) {
    if (srv === '_meta') continue;
    const t = getUpdateTime(data);
    if (t) beforeTimes[srv] = t;
  }

  // Quick check: have rankings updated since server came online?
  console.log('\n── Quick timestamp check ──');
  const currentTimes = {};
  let rankingsUpdated = true;
  for (const server of SERVERS) {
    try {
      const t = await quickCheckTimestamp(server);
      currentTimes[server.name] = t;
      const bt = beforeTimes[server.name];
      if (bt && t && t <= bt) {
        console.log(`  ${server.name}: NOT updated (${t})`);
        rankingsUpdated = false;
      } else if (bt && t) {
        console.log(`  ${server.name}: ✓ updated (${bt} → ${t})`);
      } else {
        console.log(`  ${server.name}: timestamp=${t || 'unknown'}`);
      }
    } catch(e) {
      console.log(`  ${server.name}: ERROR (${e.message})`);
      rankingsUpdated = false;
    }
    await sleep(300);
  }

  if (!rankingsUpdated && !isFinalScan) {
    console.log('\n⚠ Rankings not updated yet. Will retry next hour.');
    return;
  }

  // Check if "after" snapshot already exists
  const afterName = findFile('after-');
  const afterExists = afterName && afterName.includes(dateStr);
  let afterSnap = afterExists ? loadSnapshot(afterName) : null;
  let afterSavedAt = afterSnap && afterSnap._meta ? afterSnap._meta.savedAt : null;

  // Check if timestamps changed since last "after" snapshot
  let timestampsChangedSinceAfter = false;
  if (afterSnap) {
    for (const [srv, data] of Object.entries(afterSnap)) {
      if (srv === '_meta') continue;
      const afterTime = getUpdateTime(data);
      const currTime = currentTimes[srv];
      if (afterTime && currTime && currTime > afterTime) {
        timestampsChangedSinceAfter = true;
        console.log(`\n  ${srv}: timestamps changed since after-scan (${afterTime} → ${currTime})`);
      }
    }
  }

  // Decide what to do
  if (afterExists && !timestampsChangedSinceAfter && !isFinalScan) {
    console.log('\n✓ After snapshot exists, no new timestamp changes. Skipping.');
    return;
  }

  const reason = !afterExists ? 'INITIAL after scan'
    : timestampsChangedSinceAfter ? 'TIMESTAMPS changed — updating names'
    : 'FINAL end-of-day scan';
  console.log(`\n── Full scrape: ${reason} ──\n`);

  // Full scrape
  const snapshot = {};
  for (const server of SERVERS) {
    snapshot[server.name] = await scrapeServer(server);
    await sleep(1000);
  }
  snapshot._meta = { savedAt: now.toISOString(), type: 'after', reason };

  const total = Object.entries(snapshot).filter(([k]) => k !== '_meta').reduce((s, [, d]) => s + getPlayers(d).length, 0);
  console.log(`\nTotal players: ${total}`);

  // Save "after" snapshot (overwrite)
  saveSnapshot(`after-${dateStr}.json`, snapshot);
  fs.writeFileSync(path.resolve('data/snapshot.json'), JSON.stringify(snapshot, null, 2));
  console.log('Latest snapshot saved to data/snapshot.json');

  // Load or detect transfers
  let transferData = loadTransfers();
  let snapshotDiff = null;

  if (!afterExists) {
    // First "after" scan — detect transfers + name changes
    console.log(`\nDetecting transfers: ${beforeName} → after-${dateStr}.json`);
    const { transfers, nameChanges } = detectTransfers(beforeSnap, snapshot);

    // Build snapshot diff (disparut/nou per server) for the player viewer
    snapshotDiff = { date: dateStr };
    for (const server of SERVERS) {
      const bPlayers = getPlayers(beforeSnap[server.name]);
      const aPlayers = getPlayers(snapshot[server.name]);
      const afterNames = new Set(aPlayers.map(p => p.name));
      const beforeNames = new Set(bPlayers.map(p => p.name));
      const merged = [
        ...aPlayers.map(p => ({ ...p, _status: beforeNames.has(p.name) ? 'stayed' : 'nou' })),
        ...bPlayers.filter(p => !afterNames.has(p.name)).map(p => ({ ...p, _status: 'disparut' })),
      ];
      merged.sort((a, b) => (a.rank || 0) - (b.rank || 0));
      snapshotDiff[server.name] = merged;
    }

    if (transfers.length > 0) {
      console.log(`\n=== TRANSFERS DETECTED: ${transfers.length} ===`);
      for (const t of transfers) {
        const nameStr = t.nameAfter ? `${t.name} (temp: "${t.nameAfter}")` : t.name;
        console.log(`  ${nameStr}: ${t.from} → ${t.to} (CL${t.champLevel})`);
      }
    } else {
      console.log('\nNo transfers detected.');
    }

    if (nameChanges.length > 0) {
      console.log(`\n=== NAME CHANGES DETECTED: ${nameChanges.length} ===`);
      for (const nc of nameChanges) {
        console.log(`  ${nc.name} → ${nc.nameAfter} on ${nc.server} (CL${nc.champLevel}, ${nc.matchConfidence}% conf)`);
      }
    }

    // Save to history (or update existing entry for this date)
    const existingIdx = transferData.history.findIndex(h => h.date === dateStr);
    const entry = {
      date: dateStr,
      prevDate: beforeName.replace('before-', '').replace('.json', ''),
      transfers,
      nameChanges,
    };
    if (existingIdx >= 0) {
      transferData.history[existingIdx] = entry;
    } else {
      transferData.history.unshift(entry);
    }
    if (transferData.history.length > 12) transferData.history = transferData.history.slice(0, 12);

    transferData.lastUpdated = dateStr;
    transferData.transfers = transfers;
    transferData.nameChanges = nameChanges;
  } else {
    // Subsequent scan — update names in existing transfers
    console.log('\nUpdating transfer names...');
    const namesFixed = updateNames(transferData.transfers, snapshot);
    console.log(`Names updated: ${namesFixed}`);

    // Also update the history entry
    const histEntry = transferData.history.find(h => h.date === dateStr);
    if (histEntry) {
      updateNames(histEntry.transfers, snapshot);
    }

    transferData.lastUpdated = dateStr;
  }

  saveTransfers(transferData);
  cleanup();

  const fbUrlA = process.env.FB_DATABASE_URL;
  if (fbUrlA) {
    const fbBaseA = fbUrlA.replace(/\/$/, '');
    try {
      await fetch(fbBaseA + '/meta/autoScrape.json', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'after', status: 'done', savedAt: now.toISOString(), transfers: transferData.transfers.length, triggeredAt: Date.now() })
      });
      await fetch(fbBaseA + '/meta/snapshotRefresh.json', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Date.now())
      });
      await fetch(fbBaseA + '/transfers.json', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lastUpdated: transferData.lastUpdated,
          transfers: transferData.transfers,
          nameChanges: transferData.nameChanges || [],
          history: (transferData.history || []).slice(0, 4),
        })
      });
      console.log('Transfers written to Firebase.');
      if (snapshotDiff) {
        await fetch(fbBaseA + '/snapshotDiff.json', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(snapshotDiff)
        });
        console.log('Snapshot diff written to Firebase.');
      }
    } catch(e) { console.log('Firebase notify error:', e.message); }
  }
}

function cleanup() {
  // Keep only snapshots from the last 2 weeks
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const allFiles = fs.readdirSync(outDir).filter(f => f.endsWith('.json'));
  for (const f of allFiles) {
    const dateMatch = f.match(/\d{4}-\d{2}-\d{2}/);
    if (dateMatch && dateMatch[0] < cutoff) {
      fs.unlinkSync(path.join(outDir, f));
      console.log(`Cleaned up: ${f}`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
