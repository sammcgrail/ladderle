// ═════════════════════════════════════════════════════════════════════════
// DEV-ONLY FIXTURES — DELETE THIS FILE AT INTEGRATION.
//
// Stand-in for the real content while another agent generates src/puzzles.js
// (+ dictionary) and the encoder emits src/puzzles.enc.js. Schema matches
// SPEC.md exactly, except `path` ships in PLAINTEXT here (the real file
// carries it inside the per-day `enc` blob — app.jsx handles both shapes).
//
// Integration checklist (also in NOTES-ui.md):
//   1. rm src/puzzles.dev.js
//   2. In src/app.jsx, replace the marked "DEV FALLBACK" block with the two
//      static imports described there.
// ═════════════════════════════════════════════════════════════════════════

export const PUZZLES = [
  {
    n: 1, date: '2026-07-19',
    start: 'CAT', end: 'DOG',
    len: 3,
    par: 3,
    path: ['CAT', 'COT', 'COG', 'DOG'],
  },
  {
    n: 2, date: '2026-07-20',
    start: 'COLD', end: 'WARM',
    len: 4,
    par: 4,
    path: ['COLD', 'CORD', 'WORD', 'WARD', 'WARM'],
  },
  {
    n: 3, date: '2026-07-21',
    start: 'BLACK', end: 'BRAND',
    len: 5,
    par: 3,
    path: ['BLACK', 'BLANK', 'BLAND', 'BRAND'],
  },
];

// Tiny validation dictionary — just enough to play the fixtures and exercise
// every code path (valid step, detour, dead-end, not-a-word rejection).
export const WORDS = [
  // len 3
  'CAT', 'COT', 'COG', 'DOG', 'BAT', 'BAG', 'BOG', 'BAD', 'BED', 'BIG',
  'BUG', 'COW', 'DOT', 'COD', 'CAR', 'CAP', 'DIG', 'DUG', 'CUT', 'CUP',
  // len 4
  'COLD', 'CORD', 'CARD', 'WARD', 'WORD', 'WARM', 'WORM', 'CORN', 'COLT',
  'BOLD', 'GOLD', 'CART', 'WART', 'WORN', 'CORK', 'COAT', 'COST', 'CAST',
  // len 5
  'BLACK', 'BLANK', 'BLAND', 'BRAND', 'GLAND', 'GRAND', 'BRAIN', 'BRAID',
];
