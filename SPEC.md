# Ladderle — spec (the contract between agents)

**Live:** https://ladderle.sebland.com · repo `/root/ladderle` · port **20069** · stack mirrors `/root/sortle` (Vite + Preact, Docker + nginx).

## The game (one line)
**COLD → WARM. Change one letter at a time. Every rung has to be a real word.**

- Each day gives a **START** word and an **END** word (same length) and a **par** (the fewest moves possible).
- The player builds rungs. Each rung must be (a) a real word, (b) the same length, (c) differ from the rung above by **exactly one letter**.
- Reach END to win. Your score is **moves used vs par**. Beating par is impossible; matching it is the flex.
- No try limit — this is a *play* game, not a guessing game. Wrong entries shake and are rejected with the reason ("not a word" / "change exactly one letter"). Let people fiddle.
- **Undo** and **reset** must exist. Fiddling is the fun; punishing it is not.
- **Hint** reveals the next rung of a known-optimal path (track hints used; shown in the share).
- Share grid: `🪜 Ladderle #N — COLD→WARM in 5 (par 4)` + one emoji square per rung (🟩 on-path / 🟨 off-path detour) + the URL.

## Why this one (don't drift from it)
The roster is already heavy with knowledge-recall games. This one is **pure play** — no trivia, nothing to fact-check, instantly graspable, and the "aha" is mechanical rather than encyclopedic. Content is **computed, not authored**, so it cannot contain a factual error.

## Puzzle schema — `src/puzzles.js` (authoritative, do not change)
```js
export const PUZZLES = [
  {
    n: 1, date: '2026-07-20',
    start: 'COLD', end: 'WARM',
    len: 4,
    par: 4,                                        // fewest MOVES (path length - 1)
    path: ['COLD','CORD','WORD','WARD','WARM'],    // one VERIFIED shortest path; hidden, used for hints
  },
];
```
`start`, `end`, `len`, `par` are PUBLIC (they're on screen). Only `path` is obfuscated.

## Hard content rules (generation, not authoring)
- **Every puzzle must be verified solvable by BFS**, and the stated `par` must equal the true shortest distance. Assert this for all days at build time — a wrong par is the one unforgivable bug.
- **Every word on the optimal path must be COMMON.** A ladder that requires an obscure rung is not fun. Curate the graph to common words only; the solver's dictionary may be larger than the puzzle-generation set, but the optimal path must be walkable with everyday words.
- `par` between **3 and 5** (accessible). Skew easier for days 1–10 — those are people's first impression.
- Prefer pairs where START and END are *thematically cute* when possible (COLD→WARM, HEAD→TAIL, MOON→STAR) — it makes the day feel authored even though it's generated.
- Vary word length across days (mostly 4, some 3 and 5).
- No offensive words anywhere in the shipped dictionary or any path.

## Shared conventions
- Dates **contiguous, one per day, no gaps**, starting **2026-07-20 (TODAY — day 1 must be playable on launch; assert `PUZZLES[0].date <= today` at build)**.
- The **validation dictionary ships to the client** (both endpoints are visible anyway, so there is no answer to protect) — only `path` goes through the cipher.
- localStorage **DATE-keyed** (`ladderle-<date>`, `ladderle-stats`); a finished day stays finished on reload.
- **Mobile-first.** Gate: `/root/seb/skills/sebland-app/scripts/check-mobile.py` must exit 0 on the BUILT dist. Test at 390×844.
- ⚠️ If you use pointer capture anywhere, you MUST `releasePointerCapture` in the up/cancel handler — see `viral-game` gotchas. This exact bug shipped in Vennle.
