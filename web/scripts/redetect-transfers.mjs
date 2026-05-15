#!/usr/bin/env node
// Re-runs transfer detection on existing before/after snapshots
// Usage: node scripts/redetect-transfers.mjs [date]
// Example: node scripts/redetect-transfers.mjs 2026-04-08

import fs from 'fs';
import path from 'path';

const outDir = path.resolve('data/snapshots');
const transfersFile = path.resolve('data/transfers.json');

const dateStr = process.argv[2] || new Date().toISOString().slice(0, 10);

console.log(`Re-detecting transfers for: ${dateStr}`);

const beforeFile = path.join(outDir, `before-${dateStr}.json`);
const afterFile  = path.join(outDir, `after-${dateStr}.json`);

if (!fs.existsSync(beforeFile)) { console.error(`Missing: ${beforeFile}`); process.exit(1); }
if (!fs.existsSync(afterFile))  { console.error(`Missing: ${afterFile}`);  process.exit(1); }

const beforeSnap = JSON.parse(fs.readFileSync(beforeFile, 'utf8'));
const afterSnap  = JSON.parse(fs.readFileSync(afterFile,  'utf8'));

function getPlayers(d) { return Array.isArray(d) ? d : (d && d.players) || []; }

function statKeyBase(p) { return `${p.class || ''}|${p.level}|${p.champLevel}`; }

function champExpConfidence(before, after) {
  const delta = after.champExp - before.champExp;
  if (delta < 0) return 0;
  if (delta === 0) return 100;
  if (delta < 500_000)   return 97;
  if (delta < 2_000_000) return 90;
  if (delta < 10_000_000) return 78;
  if (delta < 30_000_000) return 60;
  if (delta < 80_000_000) return 42;
  return 25;
}

function detectTransfers(beforeSnap, afterSnap) {
  const transfers = [];
  const beforeByName = {};
  const afterByName  = {};

  for (const [srv, data] of Object.entries(beforeSnap)) {
    if (srv === '_meta') continue;
    for (const p of getPlayers(data)) beforeByName[p.name] = { server: srv, ...p };
  }
  for (const [srv, data] of Object.entries(afterSnap)) {
    if (srv === '_meta') continue;
    for (const p of getPlayers(data)) afterByName[p.name] = { server: srv, ...p };
  }

  const matched = new Set();

  // Pass 1: exact name match on different server
  for (const [name, after] of Object.entries(afterByName)) {
    const before = beforeByName[name];
    if (before && before.server !== after.server) {
      transfers.push({
        name, from: before.server, to: after.server,
        level: after.level, champLevel: after.champLevel,
        exp: after.exp, champExp: after.champExp, kingdom: after.kingdom,
        rankBefore: before.rank, rankAfter: after.rank,
        champExpDelta: after.champExp - before.champExp,
      });
      matched.add(name);
    }
  }

  // Pass 2: stat match with confidence
  const disappeared = [];
  for (const [name, b] of Object.entries(beforeByName)) {
    if (!afterByName[name] && !matched.has(name)) disappeared.push(b);
  }
  const appeared = [];
  for (const [name, a] of Object.entries(afterByName)) {
    if (!beforeByName[name] && !matched.has(name)) appeared.push(a);
  }

  const disappearedByStats = {};
  for (const p of disappeared) {
    const key = statKeyBase(p);
    if (!disappearedByStats[key]) disappearedByStats[key] = [];
    disappearedByStats[key].push(p);
  }

  for (const ap of appeared) {
    const key = statKeyBase(ap);
    const candidates = (disappearedByStats[key] || []).filter(c => c.server !== ap.server);
    if (candidates.length === 0) continue;

    const scored = candidates
      .map(c => ({ c, conf: champExpConfidence(c, ap) }))
      .filter(x => x.conf > 0)
      .sort((a, b) => b.conf - a.conf);

    if (scored.length === 0) continue;

    const best = scored[0];
    const dp = best.c;
    disappearedByStats[key].splice(disappearedByStats[key].indexOf(dp), 1);

    const delta = ap.champExp - dp.champExp;
    transfers.push({
      name: dp.name, nameAfter: ap.name,
      from: dp.server, to: ap.server,
      level: ap.level, champLevel: ap.champLevel,
      exp: ap.exp, champExp: ap.champExp, kingdom: ap.kingdom,
      rankBefore: dp.rank, rankAfter: ap.rank,
      matchedByStats: true,
      matchConfidence: best.conf,
      champExpDelta: delta,
    });
  }

  transfers.sort((a, b) => b.champLevel - a.champLevel || a.name.localeCompare(b.name));
  return transfers;
}

const { transfers, nameChanges } = detectTransfers(beforeSnap, afterSnap);

console.log(`\n=== TRANSFERS DETECTED: ${transfers.length} ===`);
for (const t of transfers) {
  const nameStr = t.nameAfter ? `${t.name} → "${t.nameAfter}"` : t.name;
  const conf = t.matchConfidence != null ? ` [${t.matchConfidence}% conf]` : '';
  console.log(`  ${nameStr}: ${t.from} → ${t.to} (CL${t.champLevel})${conf}`);
}

console.log(`\n=== NAME CHANGES DETECTED: ${nameChanges.length} ===`);
for (const nc of nameChanges) {
  console.log(`  ${nc.name} → ${nc.nameAfter} on ${nc.server} (CL${nc.champLevel}, ${nc.matchConfidence}% conf)`);
}

// Load existing or create fresh
let transferData = { lastUpdated: dateStr, transfers: [], nameChanges: [], history: [] };
if (fs.existsSync(transfersFile)) {
  try { transferData = JSON.parse(fs.readFileSync(transfersFile, 'utf8')); } catch(e) {}
}

// Update history entry for this date
const histIdx = transferData.history.findIndex(h => h.date === dateStr);
const histEntry = { date: dateStr, prevDate: dateStr, transfers, nameChanges };
if (histIdx >= 0) transferData.history[histIdx] = histEntry;
else transferData.history.unshift(histEntry);

transferData.lastUpdated = dateStr;
transferData.transfers = transfers;
transferData.nameChanges = nameChanges;

fs.writeFileSync(transfersFile, JSON.stringify(transferData, null, 2));
console.log(`\nSaved to data/transfers.json`);
