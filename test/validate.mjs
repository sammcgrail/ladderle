// Structural gate for src/puzzles.js + src/words.js. Runs FIRST in `npm run build`
// (and dev), so a broken puzzle set can never ship — the Docker image build aborts
// on exit 1. Collects ALL problems before failing (the encoder's checks stop at the
// first). Standalone run: `npm run validate` or `node test/validate.mjs`.
//
// What it asserts, per puzzle:
//   - schema: n / date / start / end / len / par / path present, right types,
//     words UPPERCASE A-Z, len consistent everywhere
//   - path[0] === start, path[path.length-1] === end, no repeated rung
//   - every consecutive pair on path differs by EXACTLY one letter (same length)
//   - par === path.length - 1, and par in SPEC's hard 3..5 band
//   - every rung (start/end included) exists in the shipped dictionary src/words.js
//   - par is the TRUE BFS-shortest distance over that shipped dictionary — belt
//     and braces on the one unforgivable bug. If the shipped dict admits a SHORTER
//     ladder than the authored par, players can beat par ("impossible" per SPEC);
//     we fail and print the shorter path so the content agent can fix or re-par.
// And, across the set:
//   - no duplicate dates, dates contiguous (one per day, no gaps)
//   - n sequential 1..N in date order
//   - PUZZLES[0].date <= today (America/New_York) — a game whose day 1 is in the
//     future launches unplayable; this exact bug shipped on Vennle.
//
// Fixture override (infra self-testing only — the real build never sets these):
// LADDERLE_PUZZLES / LADDERLE_WORDS = absolute paths to throwaway modules.
import { pathToFileURL } from 'node:url';

const moduleUrl = (envVar, fallbackRel) =>
  process.env[envVar] ? pathToFileURL(process.env[envVar]).href : new URL(fallbackRel, import.meta.url).href;

async function loadModule(label, url) {
  try {
    return await import(url);
  } catch (err) {
    console.error(`VALIDATE FAIL: cannot load ${label} (${err.message}).`);
    console.error('If the content agent has not written it yet, the build gate stays red until it exists.');
    process.exit(1);
  }
}

const puzzlesMod = await loadModule('src/puzzles.js', moduleUrl('LADDERLE_PUZZLES', '../src/puzzles.js'));
const wordsMod = await loadModule('src/words.js', moduleUrl('LADDERLE_WORDS', '../src/words.js'));

const PUZZLES = puzzlesMod.PUZZLES;

// Dictionary contract: `export const WORDS = [...]` (preferred; Array or Set, any
// case — normalized to uppercase here). Default export accepted as a fallback.
const rawWords = wordsMod.WORDS ?? wordsMod.default;

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

ok(Array.isArray(PUZZLES) && PUZZLES.length > 0, 'PUZZLES is missing or empty (src/puzzles.js must `export const PUZZLES`)');

let DICT = null; // Set of UPPERCASE words
{
  // Accept three shapes: Array, Set, or an object GROUPED BY LENGTH
  // ({ "3": [...], "4": [...], "5": [...] }) — the spec explicitly invited the
  // grouped form for compactness, so the gate must not assume a flat list.
  const flatten = (w) => {
    if (w instanceof Set) return [...w];
    if (Array.isArray(w)) return w;
    if (w && typeof w === 'object') {
      return Object.values(w).flatMap((v) => (v instanceof Set ? [...v] : Array.isArray(v) ? v : []));
    }
    return null;
  };
  const list = flatten(rawWords);
  if (!Array.isArray(list) || list.length === 0) {
    problems.push('src/words.js must export a non-empty word list (`export const WORDS` or default export; Array, Set, or {length: [...]})');
  } else {
    DICT = new Set();
    let bad = 0;
    for (const w of list) {
      if (typeof w !== 'string' || !/^[A-Za-z]+$/.test(w)) { bad++; continue; }
      DICT.add(w.toUpperCase());
    }
    ok(bad === 0, `dictionary contains ${bad} non-alphabetic entrie(s) — words must be pure A-Z strings`);
  }
}

const WORD_RE = /^[A-Z]+$/;
const isWord = (w) => typeof w === 'string' && WORD_RE.test(w);
const diffCount = (a, b) => {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
};

// ---- per-puzzle structural checks -------------------------------------------
const structurallyOk = new Map(); // puzzle -> bool (gates the BFS pass below)
for (const p of PUZZLES || []) {
  const id = `#${p.n ?? '?'} (${p.date ?? 'no date'})`;
  const before = problems.length;

  ok(Number.isInteger(p.n) && p.n >= 1, `${id}: n must be a positive integer`);
  ok(typeof p.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.date), `${id}: date must be YYYY-MM-DD`);
  ok(isWord(p.start), `${id}: start must be an UPPERCASE A-Z word (got ${JSON.stringify(p.start)})`);
  ok(isWord(p.end), `${id}: end must be an UPPERCASE A-Z word (got ${JSON.stringify(p.end)})`);
  ok(Number.isInteger(p.len) && p.len >= 2, `${id}: len must be an integer >= 2`);
  ok(Number.isInteger(p.par) && p.par >= 3 && p.par <= 5, `${id}: par must be an integer 3..5 (SPEC hard rule — accessible), got ${p.par}`);

  if (isWord(p.start) && Number.isInteger(p.len)) ok(p.start.length === p.len, `${id}: start '${p.start}' length ${p.start.length} != len ${p.len}`);
  if (isWord(p.end) && Number.isInteger(p.len)) ok(p.end.length === p.len, `${id}: end '${p.end}' length ${p.end.length} != len ${p.len}`);

  if (!Array.isArray(p.path) || p.path.length < 2) {
    problems.push(`${id}: path must be an array of at least 2 rungs (start .. end)`);
    structurallyOk.set(p, false);
    continue;
  }

  // every rung: uppercase word, right length, in the shipped dictionary
  const seenRungs = new Set();
  for (const [i, w] of p.path.entries()) {
    if (!isWord(w)) { problems.push(`${id}: path[${i}] is not an UPPERCASE A-Z word: ${JSON.stringify(w)}`); continue; }
    if (Number.isInteger(p.len) && w.length !== p.len) problems.push(`${id}: path[${i}] '${w}' length ${w.length} != len ${p.len}`);
    if (DICT && !DICT.has(w)) problems.push(`${id}: path[${i}] '${w}' is not in the shipped dictionary (src/words.js)`);
    if (seenRungs.has(w)) problems.push(`${id}: rung '${w}' repeats on the path — a shortest path never revisits a word`);
    seenRungs.add(w);
  }

  // endpoints + par arithmetic
  ok(p.path[0] === p.start, `${id}: path[0] '${p.path[0]}' !== start '${p.start}'`);
  ok(p.path[p.path.length - 1] === p.end, `${id}: path[last] '${p.path[p.path.length - 1]}' !== end '${p.end}'`);
  ok(p.par === p.path.length - 1, `${id}: par ${p.par} !== path.length - 1 (${p.path.length - 1}) — par is MOVES, not rungs`);

  // consecutive rungs: same length (implied by len check) and EXACTLY one letter apart
  for (let i = 1; i < p.path.length; i++) {
    const a = p.path[i - 1], b = p.path[i];
    if (!isWord(a) || !isWord(b)) continue; // already reported
    if (a.length !== b.length) { problems.push(`${id}: path[${i - 1}] '${a}' and path[${i}] '${b}' differ in length`); continue; }
    const d = diffCount(a, b);
    ok(d === 1, `${id}: path[${i - 1}] '${a}' -> path[${i}] '${b}' changes ${d} letters (must be exactly 1)`);
  }

  structurallyOk.set(p, problems.length === before);
}

// ---- BFS re-derivation of par over the SHIPPED dictionary -------------------
// Adjacency via wildcard buckets (C*LD etc.), built once per word length and
// shared across puzzles. Cheap: O(len * dictWords) buckets, tiny BFS frontiers.
function bucketsForLen(len, cache, dict) {
  if (cache.has(len)) return cache.get(len);
  const buckets = new Map();
  for (const w of dict) {
    if (w.length !== len) continue;
    for (let i = 0; i < len; i++) {
      const pat = w.slice(0, i) + '*' + w.slice(i + 1);
      let arr = buckets.get(pat);
      if (!arr) buckets.set(pat, (arr = []));
      arr.push(w);
    }
  }
  cache.set(len, buckets);
  return buckets;
}

function bfsShortestPath(start, end, buckets) {
  if (start === end) return [start];
  const prev = new Map([[start, null]]);
  let frontier = [start];
  while (frontier.length) {
    const next = [];
    for (const w of frontier) {
      for (let i = 0; i < w.length; i++) {
        const pat = w.slice(0, i) + '*' + w.slice(i + 1);
        const bucket = buckets.get(pat);
        if (!bucket) continue;
        for (const nb of bucket) {
          if (prev.has(nb)) continue;
          prev.set(nb, w);
          if (nb === end) {
            const path = [];
            for (let cur = end; cur !== null; cur = prev.get(cur)) path.unshift(cur);
            return path;
          }
          next.push(nb);
        }
      }
    }
    frontier = next;
  }
  return null; // unreachable — cannot happen if the authored path passed the dict check
}

if (DICT) {
  const adjCache = new Map();
  for (const p of PUZZLES || []) {
    if (!structurallyOk.get(p)) continue; // no point BFS-ing a malformed puzzle
    const shortest = bfsShortestPath(p.start, p.end, bucketsForLen(p.len, adjCache, DICT));
    if (shortest === null) {
      problems.push(`#${p.n} (${p.date}): BFS found NO path ${p.start}->${p.end} over src/words.js (dictionary inconsistent?)`);
    } else if (shortest.length - 1 !== p.par) {
      problems.push(
        `#${p.n} (${p.date}): par ${p.par} is WRONG — true shortest over the shipped dictionary is ` +
        `${shortest.length - 1} moves: ${shortest.join('->')}. ` +
        (shortest.length - 1 < p.par
          ? 'Players could BEAT par ("impossible" per SPEC). Re-par or prune the enabling word(s) from src/words.js.'
          : 'Authored path is impossibly short for this dictionary (checks above should have caught this).')
      );
    }
  }
}

// ---- cross-set checks: dates + numbering + launch playability ---------------
const sorted = [...(PUZZLES || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
const seenDates = new Set();
for (const p of sorted) {
  if (seenDates.has(p.date)) problems.push(`duplicate date ${p.date}`);
  seenDates.add(p.date);
}
for (let i = 1; i < sorted.length; i++) {
  const prev = Date.parse(sorted[i - 1].date + 'T00:00:00Z');
  const next = Date.parse(sorted[i].date + 'T00:00:00Z');
  if (next - prev !== 86400000) problems.push(`date gap between ${sorted[i - 1].date} and ${sorted[i].date}`);
}
sorted.forEach((p, i) => {
  if (p.n !== i + 1) problems.push(`n out of sequence at ${p.date}: n=${p.n}, expected ${i + 1}`);
});

// Day 1 must already be playable — a first date in the future ships an unplayable
// game (Vennle launched exactly this way). "Today" pinned to America/New_York (the
// audience's clock), independent of the build machine's TZ. en-CA => YYYY-MM-DD.
if (sorted.length > 0) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  ok(sorted[0].date <= today,
    `PUZZLES[0].date ${sorted[0].date} is in the future (today is ${today} America/New_York) — day 1 would be unplayable at launch`);
}

if (problems.length) {
  console.error(`VALIDATE FAIL — ${problems.length} problem(s) in src/puzzles.js / src/words.js:`);
  for (const m of problems) console.error('  x ' + m);
  process.exit(1);
}
console.log(
  `validate OK: ${PUZZLES.length} puzzles (${sorted[0].date} -> ${sorted[sorted.length - 1].date}), dict ${DICT.size} words — ` +
  'paths one-letter-per-rung, endpoints match, par = BFS-shortest over shipped dict, dates contiguous, n sequential, day 1 playable'
);
