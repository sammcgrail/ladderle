#!/usr/bin/env node
// =============================================================================
// Ladderle puzzle + dictionary generator.
//
//   node tools/generate.mjs            → reads tools/data/*, writes src/words.js
//                                        + src/puzzles.js (asserts everything)
//   node tools/generate.mjs --curate   → (re)builds tools/data/* word lists from
//                                        upstream sources (network or /tmp cache)
//   node tools/generate.mjs --verify   → INDEPENDENT re-verification of the two
//                                        emitted files (own parser, own graph,
//                                        own BFS — shares no generation state)
//   node tools/generate.mjs --verify --print  → also dump all decoded paths
//
// Dictionary provenance (see --curate):
//   VALID  = ENABLE word list (172k, no proper nouns / no abbreviations)
//            ∩ Norvig count_1w.txt (333k most-frequent web words → kills the
//            archaic Scrabble junk: "blype", "bosky", "braxy"…)
//            − BLOCK_ALL (slurs / profanity / offensive), lengths 3–5.
//   COMMON = VALID ∩ (google-10000-english-usa-no-swears ∪ dolph/popular)
//            − BLOCK_COMMON (crude-adjacent, clinical, interjection junk).
//            Every puzzle-path rung comes from COMMON; endpoints of generated
//            puzzles additionally sit in the google-10k frequency list.
//
// The one unforgivable bug is a wrong par. Guarantees, asserted at build AND
// re-checked by --verify:
//   par === BFS shortest distance over the FULL VALID graph (players can rung
//   through any accepted word, so this is what makes beating par impossible)
//   AND a path of exactly that length exists using ONLY COMMON words (emitted).
//   Pairs where the common graph can't match the valid-graph distance are
//   rejected outright.
// =============================================================================
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'tools', 'data');
const EPOCH = '2026-07-20';           // day 1 (must be playable on launch day)
const DAYS = 120;
const LENGTHS = [3, 4, 5];
// per-5-day length pattern → 72×4-letter, 24×3-letter, 24×5-letter
const LEN_PATTERN = [4, 3, 4, 5, 4];
const PAR_TARGET = { 3: 40, 4: 50, 5: 30 };   // rough histogram target
const EASY_DAYS = 10;                          // days 1–10: par ∈ {3,4}
const WORD_USE_CAP = 2;                        // endpoint word reuse cap
const WORD_USE_GAP = 30;                       // min days between reuses

// ---------------------------------------------------------------------------
// Blocklists. BLOCK_ALL is stripped from BOTH dictionaries (never accepted as
// input, never on a path). BLOCK_COMMON stays typeable (real words) but can
// never appear on a puzzle path or as an endpoint.
// ---------------------------------------------------------------------------
const BLOCK_ALL = new Set(`
abo abos anal anus arse arses bimbo bints bint bitch bitchy boner boners boob
boobs booby
bren busty chink chinks clit clits cock cocks coon coons cum cums cunt cunts
dago dagos darky darkie dick dicks dicky dildo dong dongs duce dyke dykes fag
fags fagot fuck fucks gimp gimps gook gooks gyp gyps gypsy heil heils homo homos
honky hos hun huns hussy jew jews jism jizz kike kikes koss kraut lez mick
micks milf minge
meth meths nads nance nazi
nazis negro nigra nooky penis piss pissy porn porno pube pubes pubic pussy quim
rape raped raper rapes rom roms sambo sambos shat shit shite shits sissy slut
sluts smut smuts spaz spazz spic spics spick spik squaw tit tits titty twat
twats vulva wank wanks wanky whore willy wog wogs wop wops yid yids
`.trim().split(/\s+/));

const BLOCK_COMMON = new Set(`
abort batty bong bongs bosom crap craps dumbo erect fanny fetus gonad harem hoe
hoes horny idiot kinky loins loony moron muff muffs narc narcs opium pansy poof
poofs prick pricks queer randy semen sexes sexed shag shags spank sperm spunk
teat teats turd turds wench
aah aahs aargh argh brr brrr hmm mmm psst shh tsk tsks umm ums
cee cees dee dees eff effs ell ells ess zee zees wye wyes chi phi rho psi tau
xis nth oft sol tis
aga ain aka alt ars ave carbo comp conn deb dey els ems ens eta gat gats gor
hep ids lar ling mach mas merl mil mis mon ohs pic pics sec sha tet wot
bach beth billy bobby butch carl dutch japan kerry leary mike molly perry roger
rube sally terry tommy tony troy
doth hath thee thine thou thy unto
blam sook
aids ala alan als ana ane anes ass asses bam ben bene bey beys bod bods brad
brads cal cant chile cole coles colin cuddy deco del devel devels dink dinks
dis dolly dom doms fave fer gage gages greek hal hart harts hast helo helos
hist jerry jess ken matt med meds mel milt milts morn mort naw oho ole ort orts
ose ped peds peter poly punky rath ree rem rems rolf sal sarge serge sex sexy
shaw shaws sim sims sou strep tach ted tho til tod tom wack wacks wally wont
yob yom
ama ami ani arf att auk ava bel cor cox coz dag dah dater daters dev devs dex
dit dol dun ers eth fay fen gar ged gib git goa gob hah hap heh hic hob hoy hup
ich iff ifs jin jones jus kat kelly kip lac lam lex lin lis lite lites lum luv
lux mac macs mol mor nee nip noh noo nos obi ops pah pap pax pis poi pom rah
rex rick ricks rin roman rya sac seg slave slaves sos sot tae taes taj tas tor
uns vee vig vis wale wales wha yah yeh yuk zed
benny cain dell dells exec execs harry inter lowe lowes playa playas sans trey
treys
gams holt holts john johns louie louies louis moll molls soma somas
bates cam cams carb carbs cates coney coneys dow dows mikes monde mondo monte
montes ness sen sens
las marc marcs res vesta vestas
hon hons ins lars libs morse pac pacs pam pams primo primos promo promos saith
sike sikes
hong hongs huck hucks ser sers toms
brit brits casa casas cos dos moil moils nome nomes
joe joes jun juns kent kents para paras saul sauls sept septs stat
doc docs mache maches pas rec recs ruth ruths stang stangs tope topes
costa costas laker lakers spec specs tare tares tate tates
bree brees brock brocks delly gen gens glen glens mack macks rand rands
chico chicos gay gays nelly
eng engs josh joshes tosh
garth garths haps nite nites
dost jake jakes
biz grope groped gropes
chad chads naked pee pees sade sades syne synes
mem mems shalt vive vives
griff griffs sox
flack flacks lat lats pele peles
jill jills mag mags
mae maes paris
lang langs fetal
`.trim().split(/\s+/));

// ---------------------------------------------------------------------------
// Curated "cute" pairs (thematic START→END). Each is re-verified at generation
// time: it must satisfy distCOMMON === distVALID ∈ [3,5] or it is DROPPED with
// a warning — nothing is trusted from this table but the theming.
// PINNED entries are fixed to a specific day (day must match the length slot).
// ---------------------------------------------------------------------------
const PINS = [
  { day: 1, a: 'cold', b: 'warm' },   // the spec's own marquee example
  { day: 2, a: 'cat', b: 'dog' },
  { day: 4, a: 'train', b: 'track' },
  { day: 11, a: 'word', b: 'game' },  // the flagship pair for a word game
];
const CUTE = {
  3: [['sun','sky'],['boy','man'],['wet','dry'],['eat','pie'],['pig','sty'],
      ['six','ten'],['bee','fly'],['ear','eye'],['tea','pot'],['cow','hay'],
      ['fox','cub'],['oil','gas'],['arm','leg'],['pen','ink'],['ram','ewe'],
      ['sea','fog'],['red','tan'],['bud','sap'],['paw','fur'],['gem','ore'],
      ['dog','pup'],['two','ten'],['mud','pie'],['sip','tea']],
  4: [['head','tail'],['give','take'],['year','week'],['moon','star'],
      ['love','kiss'],['hand','foot'],['salt','sand'],['rock','roll'],
      ['tide','wave'],['song','tune'],['beer','brew'],['lead','gold'],
      ['wood','coal'],['dusk','dark'],['left','east'],['pink','rose'],
      ['mind','body'],['meat','bone'],['hair','bald'],['less','more'],
      ['mice','rats'],['long','wide'],['tale','myth'],['gold','coin'],
      ['bull','calf'],['pool','pond'],['heat','cool'],['seed','tree'],
      ['bird','nest'],['king','pawn'],['surf','wave'],['boat','sail'],
      ['ship','port'],['cash','coin'],['soup','stew'],['nose','chin'],
      ['card','deck'],['best','good'],['duck','pond'],['beak','claw'],
      ['worm','bird'],['mint','coin'],['fire','cold'],['coal','fire'],
      ['warm','cool'],['hand','fist'],['dice','game'],['gold','mine']],
  5: [['storm','shine'],['smile','shine'],['sweet','treat'],['goose','geese'],
      ['teeth','tooth'],['pride','proud'],['crane','stork'],['grain','brain'],
      ['bread','beard'],['stove','stone'],['shore','share'],['crown','clown']],
};

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------
const isoDay = (i) => new Date(Date.UTC(2026, 6, 20) + i * 86400000).toISOString().slice(0, 10);
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hamming = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; };
function buildAdj(words) {
  const buckets = new Map(), adj = new Map(words.map((w) => [w, []]));
  for (const w of words) for (let i = 0; i < w.length; i++) {
    const k = w.slice(0, i) + '_' + w.slice(i + 1);
    let arr = buckets.get(k); if (!arr) buckets.set(k, (arr = []));
    arr.push(w);
  }
  for (const arr of buckets.values())
    for (const a of arr) for (const b of arr) if (a !== b) adj.get(a).push(b);
  return adj;
}
function bfsDist(adj, src) {
  const d = new Map([[src, 0]]); const q = [src];
  for (let i = 0; i < q.length; i++) {
    const u = q[i];
    for (const v of adj.get(u)) if (!d.has(v)) { d.set(v, d.get(u) + 1); q.push(v); }
  }
  return d;
}
const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT FAILED: ' + msg); };

// ---------------------------------------------------------------------------
// --curate: build tools/data from upstream lists (cached in /tmp if present)
// ---------------------------------------------------------------------------
const SOURCES = {
  'enable1.txt': 'https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt',
  'g10k.txt': 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears.txt',
  'popular.txt': 'https://raw.githubusercontent.com/dolph/dictionary/master/popular.txt',
  'count_1w.txt': 'https://norvig.com/ngrams/count_1w.txt',
};
async function curate() {
  mkdirSync(DATA, { recursive: true });
  const raw = {};
  for (const [name, url] of Object.entries(SOURCES)) {
    const cache = '/tmp/ladderle-src/' + name;
    if (existsSync(cache)) raw[name] = readFileSync(cache, 'utf8');
    else {
      console.log('fetching', url);
      raw[name] = await (await fetch(url)).text();
    }
  }
  const clean = (t) => t.split('\n').map((w) => w.trim().toLowerCase()).filter((w) => /^[a-z]{3,5}$/.test(w));
  const EN = new Set(clean(raw['enable1.txt']));
  const NOR = new Set(clean(raw['count_1w.txt'].replace(/\t\d+/g, '')));
  const G = new Map(); clean(raw['g10k.txt']).forEach((w, i) => { if (!G.has(w)) G.set(w, i); });
  const P = new Set(clean(raw['popular.txt']));
  for (const L of LENGTHS) {
    const valid = [...EN]
      .filter((w) => w.length === L && (NOR.has(w) || G.has(w) || P.has(w)) && !BLOCK_ALL.has(w))
      .sort();
    const common = valid.filter((w) => (G.has(w) || P.has(w)) && !BLOCK_COMMON.has(w));
    writeFileSync(join(DATA, `valid-${L}.txt`), valid.join('\n') + '\n');
    // common carries the google-10k frequency rank (-1 = popular-list only)
    writeFileSync(join(DATA, `common-${L}.txt`),
      common.map((w) => `${w} ${G.has(w) ? G.get(w) : -1}`).join('\n') + '\n');
    console.log(`len ${L}: valid=${valid.length} common=${common.length}`);
  }
  console.log('curated →', DATA);
}

// ---------------------------------------------------------------------------
// Load curated data
// ---------------------------------------------------------------------------
function loadData() {
  const S = {};
  for (const L of LENGTHS) {
    const valid = readFileSync(join(DATA, `valid-${L}.txt`), 'utf8').trim().split('\n');
    const commonLines = readFileSync(join(DATA, `common-${L}.txt`), 'utf8').trim().split('\n');
    const rank = new Map();   // word → g10k rank (or -1)
    const common = [];
    for (const line of commonLines) {
      const [w, r] = line.split(' ');
      common.push(w); rank.set(w, +r);
    }
    const validSet = new Set(valid), commonSet = new Set(common);
    for (const w of common) assert(validSet.has(w), `COMMON ⊄ VALID: ${w}`);
    S[L] = {
      valid, common, validSet, commonSet, rank,
      adjV: buildAdj(valid), adjC: buildAdj(common),
    };
  }
  return S;
}
// friendliness score: high-frequency words rank near 0 → big score
const wscore = (S, L, w) => {
  const r = S[L].rank.get(w);
  return r === undefined ? 0 : r >= 0 ? 10000 - r : 120;
};

// among ALL shortest common paths a→b, pick the friendliest (maximise the
// weakest rung's frequency score, then the total). `fatigue` counts how often
// a word already served as a rung on earlier days — penalising it diversifies
// the hint paths so the same clusters (ALONE/CLONE/THOSE…) don't recur.
function bestCommonPath(S, L, a, b, dist, fatigue = new Map()) {
  const da = bfsDist(S[L].adjC, a), db = bfsDist(S[L].adjC, b);
  // DP over the shortest-path DAG, layer by layer from a
  const best = new Map([[a, { min: Infinity, sum: 0, prev: null }]]);
  const layers = []; // words at distance k on some shortest path
  for (let k = 0; k <= dist; k++)
    layers.push(S[L].common.filter((w) => da.get(w) === k && db.get(w) === dist - k));
  for (let k = 1; k <= dist; k++) {
    for (const w of layers[k]) {
      const sc = wscore(S, L, w) - 2500 * (fatigue.get(w) ?? 0);
      let cand = null;
      for (const p of S[L].adjC.get(w)) {
        const bp = best.get(p);
        if (!bp || da.get(p) !== k - 1) continue;
        const c = { min: Math.min(bp.min, sc), sum: bp.sum + sc, prev: p };
        if (!cand || c.min > cand.min || (c.min === cand.min && c.sum > cand.sum)) cand = c;
      }
      if (cand) best.set(w, cand);
    }
  }
  assert(best.has(b), `no common path ${a}→${b}`);
  const path = [b];
  while (path[0] !== a) path.unshift(best.get(path[0]).prev);
  return path;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------
async function generate() {
  const S = loadData();
  emitWords(S);                       // checkpoint: words.js hits disk first

  const rng = mulberry32(0x1adde51e);
  const usedPairs = new Set();        // unordered "a|b"
  const useCount = new Map();         // word → count (as endpoint)
  const lastUsedDay = new Map();      // word → day
  const rungUses = new Map();         // word → times it appeared on any path
  const startUsed = new Set(), endUsed = new Set(); // role-specific reuse guard
  const pairKey = (a, b) => [a, b].sort().join('|');

  const okWordUse = (w, day) =>
    (useCount.get(w) ?? 0) < WORD_USE_CAP &&
    day - (lastUsedDay.get(w) ?? -999) >= WORD_USE_GAP;
  const recordUse = (a, b, day) => {
    usedPairs.add(pairKey(a, b));
    startUsed.add(a); endUsed.add(b);
    for (const w of [a, b]) {
      useCount.set(w, (useCount.get(w) ?? 0) + 1);
      lastUsedDay.set(w, day);
    }
  };

  // qualify a pair: distVALID === distCOMMON ∈ [3,5] (and par cap for the day)
  function qualify(L, a, b, day) {
    if (!S[L].commonSet.has(a) || !S[L].commonSet.has(b)) return null;
    const dv = bfsDist(S[L].adjV, a).get(b);
    const dc = bfsDist(S[L].adjC, a).get(b);
    if (dv === undefined || dv !== dc || dv < 3 || dv > 5) return null;
    if (day <= EASY_DAYS && dv > 4) return null;
    return dv;
  }

  // verified cute queues per length; their words are RESERVED so a generated
  // pair can't poach them first (e.g. a random SURF→HOME before SURF→WAVE)
  const cuteQ = { 3: [], 4: [], 5: [] };
  const reserved = new Set(PINS.flatMap((p) => [p.a, p.b]));
  for (const L of LENGTHS)
    for (const [a, b] of CUTE[L]) {
      const dv = qualify(L, a, b, 999);
      if (dv) { cuteQ[L].push({ a, b, par: dv }); reserved.add(a); reserved.add(b); }
      else console.log(`  (cute dropped: ${a}→${b} — no matching common/valid distance in [3,5])`);
    }

  const parCount = { 3: 0, 4: 0, 5: 0 };
  const puzzles = [];

  function pickGenerated(L, day, prevPar) {
    // par with the largest remaining deficit (prefer ≠ prevPar; days 1-10 ≤4)
    const allowed = (day <= EASY_DAYS ? [3, 4] : [3, 4, 5])
      .sort((x, y) => (PAR_TARGET[y] - parCount[y]) - (PAR_TARGET[x] - parCount[x]));
    const parOrder = allowed.filter((p) => p !== prevPar).concat(allowed.filter((p) => p === prevPar));
    // endpoint pool: common ∩ google-10k, usable today; a generated puzzle never
    // reuses a word in the same role (kills near-duplicate days like
    // AREA→GRIP / AREA→GRAD)
    const pool = S[L].common.filter((w) =>
      S[L].rank.get(w) >= 0 && okWordUse(w, day) && !reserved.has(w));
    const startPool = pool.filter((w) => !startUsed.has(w));
    for (const targetPar of parOrder) {
      for (let attempt = 0; attempt < 400; attempt++) {
        const a = startPool[Math.floor(rng() ** 1.6 * startPool.length)]; // skew to frequent
        if (!a) continue;
        const dv = bfsDist(S[L].adjV, a), dc = bfsDist(S[L].adjC, a);
        let best = null;
        for (const b of pool) {
          if (b === a || endUsed.has(b) || usedPairs.has(pairKey(a, b))) continue;
          if (dc.get(b) !== targetPar || dv.get(b) !== targetPar) continue;
          if (a.endsWith('s') && b.endsWith('s')) continue;      // lazy plural pairs
          const h = hamming(a, b);
          if (h < 2) continue;
          const score = wscore(S, L, a) + wscore(S, L, b) +
            (h === L ? 800 : 0) + (h >= 3 ? 300 : 0) + rng() * 500 -
            800 * ((rungUses.get(a) ?? 0) + (rungUses.get(b) ?? 0));
          if (!best || score > best.score) best = { b, score };
        }
        if (best) return { a, b: best.b, par: targetPar };
      }
    }
    throw new Error(`could not generate a pair for len ${L} day ${day}`);
  }

  let prevPar = 0;
  for (let day = 1; day <= DAYS; day++) {
    const L = LEN_PATTERN[(day - 1) % LEN_PATTERN.length];
    let chosen = null;

    const pin = PINS.find((p) => p.day === day);
    if (pin) {
      assert(pin.a.length === L, `pin ${pin.a}→${pin.b} wrong length for day ${day} (need ${L})`);
      const par = qualify(L, pin.a, pin.b, day);
      assert(par, `pinned pair ${pin.a}→${pin.b} failed qualification`);
      chosen = { a: pin.a, b: pin.b, par };
    } else {
      // sprinkle cutes: always in week one, ~55% thereafter while stock lasts
      const wantCute = cuteQ[L].length > 0 && (day <= 10 || rng() < 0.55);
      if (wantCute) {
        const i = cuteQ[L].findIndex((c) =>
          !usedPairs.has(pairKey(c.a, c.b)) && okWordUse(c.a, day) && okWordUse(c.b, day) &&
          (day > EASY_DAYS || c.par <= 4));
        if (i >= 0) chosen = cuteQ[L].splice(i, 1)[0];
      }
      if (!chosen) chosen = pickGenerated(L, day, prevPar);
    }

    const { a, b, par } = chosen;
    const path = bestCommonPath(S, L, a, b, par, rungUses);

    // ------- hard per-puzzle asserts (the "wrong par" firewall) -------
    assert(bfsDist(S[L].adjV, a).get(b) === par, `par≠distVALID ${a}→${b}`);
    assert(path.length === par + 1, `path length ≠ par+1 ${a}→${b}`);
    assert(path[0] === a && path[par] === b, `path endpoints ${a}→${b}`);
    for (let i = 1; i < path.length; i++)
      assert(hamming(path[i - 1], path[i]) === 1, `non-1 step ${path[i - 1]}→${path[i]}`);
    for (const w of path) assert(S[L].commonSet.has(w), `non-common rung ${w}`);
    assert(par >= 3 && par <= 5, `par range ${par}`);
    if (day <= EASY_DAYS) assert(par <= 4, `day ${day} too hard (par ${par})`);
    assert(!usedPairs.has(pairKey(a, b)), `duplicate pair ${a}→${b}`);

    recordUse(a, b, day);
    for (const w of path) rungUses.set(w, (rungUses.get(w) ?? 0) + 1);
    parCount[par]++; prevPar = par;
    puzzles.push({ n: day, date: isoDay(day - 1), start: a, end: b, len: L, par, path });
  }

  await emitPuzzles(puzzles);
  const lens = { 3: 0, 4: 0, 5: 0 };
  for (const p of puzzles) lens[p.len]++;
  console.log(`generated ${puzzles.length} puzzles  par{3:${parCount[3]} 4:${parCount[4]} 5:${parCount[5]}}  len{3:${lens[3]} 4:${lens[4]} 5:${lens[5]}}`);
  console.log('cute pairs left over:', LENGTHS.map((L) => `${L}:${cuteQ[L].length}`).join(' '));
}

// ---------------------------------------------------------------------------
// Emit src/words.js — fixed-width packed strings (no separators needed)
// ---------------------------------------------------------------------------
function emitWords(S) {
  const pack = (L) => S[L].valid.join('');
  const counts = LENGTHS.map((L) => `${L}:${S[L].valid.length}`).join(' ');
  const js = `// AUTO-GENERATED by tools/generate.mjs — do not hand-edit.
// Ladderle validation dictionary (${counts} words).
// Source: ENABLE ∩ Norvig-333k web-frequency list, lengths 3–5, lowercase,
// no proper nouns / abbreviations / offensive terms / archaic junk.
// Packed as fixed-width concatenated strings per length (word i of length L
// is s.slice(i*L, i*L+L)); unpacked to Sets at module load.
const W3 = '${pack(3)}';
const W4 = '${pack(4)}';
const W5 = '${pack(5)}';
function unpack(s, n) {
  const set = new Set();
  for (let i = 0; i < s.length; i += n) set.add(s.slice(i, i + n));
  return set;
}
export const WORDS = { 3: unpack(W3, 3), 4: unpack(W4, 4), 5: unpack(W5, 5) };
export function isWord(w) {
  w = String(w).toLowerCase();
  const set = WORDS[w.length];
  return !!set && set.has(w);
}
`;
  writeFileSync(join(ROOT, 'src', 'words.js'), js);
  console.log(`wrote src/words.js (${counts})`);
}

// ---------------------------------------------------------------------------
// Emit src/puzzles.js — PLAINTEXT authoring source per SPEC.md. `path` stays a
// plain uppercase array here; encode-puzzles.mjs ciphers it into
// src/puzzles.enc.js at build time (the app imports only the encoded file).
// ---------------------------------------------------------------------------
async function emitPuzzles(puzzles) {
  const rows = puzzles.map((p) => {
    const up = (w) => `'${w.toUpperCase()}'`;
    return `  { n: ${p.n}, date: '${p.date}', start: ${up(p.start)}, end: ${up(p.end)}, len: ${p.len}, par: ${p.par},\n    path: [${p.path.map(up).join(',')}] },`;
  });
  const js = `// AUTO-GENERATED by tools/generate.mjs — do not hand-edit. Schema: SPEC.md.
// Plaintext authoring source. \`path\` is one verified shortest ladder
// (start…end inclusive, par+1 rungs, every rung an everyday COMMON word);
// encode-puzzles.mjs obfuscates it into src/puzzles.enc.js at build time.
// par === true BFS shortest distance over the full validation dictionary
// (src/words.js) — beating par is impossible; matching it is the flex.
// Gates: test/validate.mjs (build) + tools/generate.mjs --verify.
export const PUZZLES = [
${rows.join('\n')}
];
`;
  writeFileSync(join(ROOT, 'src', 'puzzles.js'), js);
  console.log(`wrote src/puzzles.js (${puzzles.length} puzzles, plaintext paths)`);
}

// ---------------------------------------------------------------------------
// --verify: independent re-check of the EMITTED artifacts. Deliberately uses
// its own graph construction + BFS and reads only src/words.js, src/puzzles.js,
// src/cipher.js and tools/data/common-*.txt. No state from generation.
// ---------------------------------------------------------------------------
async function verify(print) {
  const { PUZZLES } = await import(join(ROOT, 'src', 'puzzles.js'));
  const { WORDS, isWord } = await import(join(ROOT, 'src', 'words.js'));
  const fail = [];
  const check = (c, msg) => { if (!c) fail.push(msg); };

  // fresh adjacency + BFS (independent implementations)
  const neighborsOf = (dict, w) => {
    const out = [];
    for (let i = 0; i < w.length; i++)
      for (const c of 'abcdefghijklmnopqrstuvwxyz') {
        if (c === w[i]) continue;
        const v = w.slice(0, i) + c + w.slice(i + 1);
        if (dict.has(v)) out.push(v);
      }
    return out;
  };
  const shortest = (dict, a, b) => {
    if (a === b) return 0;
    let frontier = [a]; const seen = new Set([a]);
    for (let d = 1; frontier.length; d++) {
      const next = [];
      for (const u of frontier)
        for (const v of neighborsOf(dict, u)) {
          if (seen.has(v)) continue;
          if (v === b) return d;
          seen.add(v); next.push(v);
        }
      frontier = next;
    }
    return Infinity;
  };

  const commonSets = {};
  for (const L of LENGTHS)
    commonSets[L] = new Set(readFileSync(join(DATA, `common-${L}.txt`), 'utf8')
      .trim().split('\n').map((l) => l.split(' ')[0]));

  check(Array.isArray(PUZZLES) && PUZZLES.length === DAYS, `expected ${DAYS} puzzles, got ${PUZZLES?.length}`);
  check(PUZZLES[0]?.date === EPOCH, `day 1 date ${PUZZLES[0]?.date} ≠ ${EPOCH}`);
  const today = new Date().toISOString().slice(0, 10);
  check(PUZZLES[0]?.date <= today, `day 1 (${PUZZLES[0]?.date}) not playable today (${today})`);

  const seenPairs = new Set();
  const parHist = { 3: 0, 4: 0, 5: 0 }, lenHist = { 3: 0, 4: 0, 5: 0 };
  PUZZLES.forEach((p, i) => {
    const tag = `#${p.n} ${p.start}→${p.end}`;
    check(p.n === i + 1, `${tag}: n not sequential (${p.n} at index ${i})`);
    check(p.date === isoDay(i), `${tag}: date ${p.date} ≠ expected ${isoDay(i)} (gap!)`);
    check([3, 4, 5].includes(p.len), `${tag}: bad len`);
    check(/^[A-Z]+$/.test(p.start) && /^[A-Z]+$/.test(p.end), `${tag}: endpoints not uppercase A–Z`);
    check(p.start.length === p.len && p.end.length === p.len, `${tag}: len mismatch`);
    check(p.start !== p.end, `${tag}: start === end`);
    check(Number.isInteger(p.par) && p.par >= 3 && p.par <= 5, `${tag}: par ${p.par} out of [3,5]`);
    if (p.n <= EASY_DAYS) check(p.par <= 4, `${tag}: day ${p.n} should be gentle, par ${p.par}`);
    const key = [p.start, p.end].sort().join('|');
    check(!seenPairs.has(key), `${tag}: duplicate start/end pair`);
    seenPairs.add(key);

    const path = p.path;
    check(Array.isArray(path) && path.length === p.par + 1, `${tag}: path length ${path?.length} ≠ par+1`);
    check(path[0] === p.start && path[path.length - 1] === p.end, `${tag}: path endpoints wrong`);
    check(new Set(path).size === path.length, `${tag}: repeated word in path`);
    for (let k = 0; k < path.length; k++) {
      const w = path[k];
      check(typeof w === 'string' && w.length === p.len && /^[A-Z]+$/.test(w), `${tag}: bad rung '${w}'`);
      check(isWord(w), `${tag}: rung '${w}' not in shipped dictionary`);
      check(commonSets[p.len].has(w.toLowerCase()), `${tag}: rung '${w}' not COMMON`);
      if (k > 0) {
        let diff = 0;
        for (let j = 0; j < p.len; j++) if (path[k][j] !== path[k - 1][j]) diff++;
        check(diff === 1, `${tag}: step ${path[k - 1]}→${path[k]} changes ${diff} letters`);
      }
    }
    // THE check: par must equal the true BFS distance over the full dictionary
    const d = shortest(WORDS[p.len], p.start.toLowerCase(), p.end.toLowerCase());
    check(d === p.par, `${tag}: PAR WRONG — stated ${p.par}, true BFS distance ${d}`);

    parHist[p.par]++; lenHist[p.len]++;
    if (print) console.log(`#${String(p.n).padStart(3)} ${p.date} L${p.len} par${p.par}  ${path.join(' → ')}`);
  });

  // dictionary hygiene: worst-of-the-worst must not be typeable (own list —
  // independent of the generator's blocklist)
  for (const s of ['fuck', 'shit', 'cunt', 'kike', 'spic', 'dyke', 'fags', 'twat', 'rape'])
    check(!isWord(s), `dictionary contains blocked word '${s}'`);

  const dictSizes = LENGTHS.map((L) => `${L}:${WORDS[L].size}`).join(' ');
  console.log(`dictionary sizes ${dictSizes}`);
  console.log(`par distribution 3:${parHist[3]} 4:${parHist[4]} 5:${parHist[5]}  lengths 3:${lenHist[3]} 4:${lenHist[4]} 5:${lenHist[5]}`);
  if (fail.length) {
    console.error(`\n❌ ${fail.length} VIOLATION(S):`);
    for (const f of fail) console.error('  -', f);
    process.exit(1);
  }
  console.log(`\n✅ ALL ${PUZZLES.length} PUZZLES VERIFIED — par === true BFS distance on the shipped dictionary, all paths common, dates contiguous from ${EPOCH}, no duplicate pairs.`);
}

// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
if (args.includes('--curate')) await curate();
else if (args.includes('--verify')) await verify(args.includes('--print'));
else await generate();
