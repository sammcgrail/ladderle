// The ONE place calendar-date <-> puzzle is decided for Ladderle.
//
// Ladderle used to STICK on its last dated puzzle (#120, 2026-11-16) once the calendar
// ran past it — the finite-game bug. Now the puzzle POOL LOOPS FOREVER: a stride walk
// maps every day to a pool index, cycle 0 is the authored order (so the original dated
// run plays unchanged), every later cycle is a fresh permutation, and the seam is
// repaired so the same puzzle never lands two mornings running. Same module as
// sortle/spoondle/vennle/emojle/emojlgame/birdle/anthro.
//
// The pool is PUZZLES in n-order; a puzzle's own `date` field is now just its stable
// authoring id / cipher key, NOT when it plays. What day you play is the calendar
// date; which puzzle you get is indexForDate(calendarDate, poolSize).
export const EPOCH = '2026-07-20';        // Ladderle #1

const MS = 86400000;
const parseUTC = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const addDays = (s, n) => new Date(parseUTC(s) + n * MS).toISOString().slice(0, 10);

// whole days from EPOCH to a date string (both parsed the same way, so timezone
// cancels — this is a pure day count, not a wall-clock instant).
export const dayIndex = (s) => Math.round((parseUTC(s) - parseUTC(EPOCH)) / MS);
// Ever-climbing puzzle number. NOT a pool index — on day 500 this reads #500 while
// the puzzle shown is wherever the walk landed in the pool.
export const numberForDate = (s) => dayIndex(s) + 1;

// Preferred strides, spaced so consecutive days don't repeat a theme cluster.
// ⚠️ A stride only yields a PERMUTATION if it is coprime to N (the pool size), and
// N grows every time a puzzle is added — so coprimality is enforced at RUNTIME
// against the live N, never assumed from a hand-picked list.
const CLEAN_STRIDES = [7, 11, 17, 23, 29];
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

function params(cycle, N) {
  let s = ((cycle + 1) * 2654435761) >>> 0;
  s = ((s * 1664525) + 1013904223) >>> 0;
  let stride = CLEAN_STRIDES[(s >>> 16) % CLEAN_STRIDES.length] % N;
  if (stride < 1) stride = 1;
  while (gcd(stride, N) !== 1) stride = (stride % N) + 1;   // terminates: gcd(1,N)===1
  return { start: s, stride };
}

function walk(cycle, N) {
  if (cycle <= 0) return Array.from({ length: N }, (_, i) => i);
  const { start, stride } = params(cycle, N);
  return Array.from({ length: N }, (_, i) => ((start % N) + i * stride) % N);
}

export function orderFor(cycle, N) {
  if (cycle <= 0) return walk(0, N);
  const a = walk(cycle, N);
  // Close the seam: a per-cycle permutation says nothing about the boundary, so
  // ~1 cycle in N would serve the previous cycle's last puzzle again on day one.
  if (N > 2 && a[0] === walk(cycle - 1, N)[N - 1]) { const t = a[0]; a[0] = a[1]; a[1] = t; }
  return a;
}

// Pool index for a calendar date. -1 before EPOCH (unplayable).
export function indexForDate(s, N) {
  const i = dayIndex(s);
  if (i < 0 || N < 1) return -1;
  return orderFor(Math.floor(i / N), N)[((i % N) + N) % N];
}
