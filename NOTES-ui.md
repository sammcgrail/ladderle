# Ladderle UI — build notes (UI agent)

## Checkpoint 1 — design locked (after reading SPEC + siblings + skills)

Files I own: `src/app.jsx`, `src/styles.css`, `src/reveal.jsx` (+ temporary `src/puzzles.dev.js`, delete at integration).

**Layout decision (mobile keyboard):** unlike sortle/vennle (document scroll), Ladderle has a text
input, so `.wrap` is a `height:100dvh` flex column: header/meta on top, `.scroll` (flex:1,
overflow-y:auto) holds the ladder, and a pinned `.dock` at the bottom holds the letter-box input +
Undo/Reset/Hint/Add-rung. The ladder is **bottom-anchored** (`.ladder > :first-child {
margin-top:auto }` — NOT justify-content:flex-end, which clips top overflow) and stuck to
scrollBottom, so the active zone (current word → ghost slot → END) never moves as rungs are added —
that is the "reserve space / no layout shift" answer. A `visualViewport` handler sets `--kb` (keyboard
overlap) as extra wrap bottom-padding for iOS, where dvh ignores the keyboard.

**Input model:** a visually-hidden real `<input type="search" name="ladderle-q" enterkeyhint="go">`
(iOS contact-autofill kill per viral-game pillar 8) behind a row of letter boxes. Native editing is
the whole trick: tapping a box (or a letter of the current rung in the ladder) prefills the entry
with the current word and `setSelectionRange(i, i+1)` — the next typed letter REPLACES exactly that
letter. Selection state mirrored to the boxes via `selectionchange`. Enter/go submits (form wrapper).
Backspace on an empty entry = undo last rung (non-repeat presses only).

**No pointer capture anywhere** — no dragging in this game, so the Vennle capture-leak class of bug
cannot occur. Ladder letter buttons + dock buttons use `onPointerDown={preventDefault}` so tapping
them never drops the keyboard (viral-game §chrome), which also kills the iOS loupe on them.

**Validation order:** length → exactly-one-letter (reports how many changed) → dictionary. Shake +
reason in a FIXED-HEIGHT dock status line (reflow rule §5b) that otherwise shows `MOVES n · PAR p ·
💡h`. Never silently rejects.

**Hint:** BFS distance map from END over the shipped dictionary (pattern-bucket neighbors, memoized).
Next step = neighbor with dist-1, preferring the stored optimal `path` (SPEC: optimal rungs must be
common words). Charged once per position (re-tapping Hint on the same word doesn't double-charge).
Fills the entry; player commits with Enter.

**Share squares:** 🟩 iff the move strictly decreased BFS distance-to-END (a step on *some* shortest
route), else 🟨 — fairer than comparing to the single stored path, and a detour reads as
🟨🟨🟩🟩🟩 "wasted two, then ran it home".

**Celebration:** reveal.jsx cascades the final ladder top→bottom, changed letters pop tinted by
their share square, END glows; par-match = big gold confetti + 🏆 line, over-par = smaller
green/sky confetti + "one par route: …" reveal. Confetti only on a FRESH win (not on reload of a
finished day). `prefers-reduced-motion` skips it.

**Data contract hedging (for integration):** app resolves puzzles via
`import.meta.glob('./puzzles.enc.js')` with a clearly-marked DEV FALLBACK block to `puzzles.dev.js`;
`puzzlePath()` accepts `path` plaintext (dev), `enc` = encoded array, or `enc` = encoded `{path}`.
Dictionary resolved from `./words.js|./dictionary.js|./dict.js|./wordlist.js` (export `WORDS` /
`DICTIONARY` / `WORD_LIST` / default; array, Set, len-keyed object, or whitespace string all
accepted). If none found it falls back to the dev list and `console.error`s loudly.

## For the infra/content agents (not my files)

- `index.html` still carries Sortle's favicon + meta description — needs a Ladderle icon/description.
  Consider adding `interactive-widget=resizes-content` to the viewport meta (Android keyboard).
- Dictionary module name is unresolved in the SPEC — I probe `src/words.js` (preferred),
  `dictionary.js`, `dict.js`, `wordlist.js`. Pick one of those or tell me.
- At integration: `rm src/puzzles.dev.js` and replace the marked DEV FALLBACK block at the top of
  `app.jsx` with two static imports (instructions are in the block comment).

## Checkpoint 2 — built + static gate green (2026-07-20)

- `npm install` + `npx vite build` clean (use `npx vite build`, NOT `npm run build`, until the
  infra agent lands `encode-puzzles.mjs` — the prebuild hook references it).
- `check-mobile.py dist/index.html` → PASS (all items).
- Emoji gotcha for future me: `\u{...}` escapes only work in JS strings, NOT in JSX text — use
  literal emoji in JSX.
- Next: vite preview :4183 + Playwright 390×844 full playthrough.

## Checkpoint 3 — VERIFIED, both data modes (final)

Real content landed mid-build (`puzzles.js` 120 days, `words.js`, `encode-puzzles.mjs`). Adapted:
- Dictionary flattener now expands the real `WORDS = {3:Set,4:Set,5:Set}` (lowercase) shape — first
  version missed Sets inside object values.
- `puzzlePath()`/`unwrapPath()` handles every wrapping: plaintext array (dev), `enc`=encode(array),
  `enc`=encode({path}), and cipher STRINGS incl. double-wrapped (puzzles.js pre-obfuscates `path`;
  note the checked-in encode-puzzles.mjs currently *expects a plaintext array* — the content/infra
  pair have a shape mismatch to settle; the UI is robust to both outcomes).
- Tree-shaking landmine (cost one debug cycle): accessing a glob module's export through an alias
  (`(a||b).WORDS`) let rollup DROP the dev word list from the bundle. Dev fallback is now a static
  `import * as DEV` with direct member access. If you restructure the fallback block, grep the built
  bundle for a word (e.g. GLAND) to prove the list shipped.

Verification (all green):
- `npx vite build` clean; `check-mobile.py dist/index.html` PASS.
- Playwright chromium --no-sandbox, 390×844, isMobile+hasTouch — TWO suites:
  - `/tmp/ladderle-verify.py` (dev-fallback fixtures): every invalid-entry reason (length /
    same-word / multi-diff-with-count / not-a-word), diff-letter highlight, dock+END geometry
    unchanged when a rung lands (no layout shift), 390×490 keyboard-band visibility, backspace-undo
    + Undo button, two-tap Reset, detour, par win, gold confetti, exact share string, reload
    persistence, past-day tap-to-edit + 3 hints + exact `?d=1` share with `💡3`, stats, 0 console errors.
  - `/tmp/ladderle-verify-real.py` (real 120-day data, enc generated via the infra agent's own
    encoder + their real dictionary): hint decodes real enc (CORD), over-par run 🟩🟨🟩🟩🟩 with
    par-route reveal + exact share `in 5 (par 4) · 💡1`, calendar 120 days / 119 locked, clean par
    run exact share, 0 console errors.
- `src/puzzles.enc.js` currently in the tree is a build artifact I generated FROM their puzzles.js
  via their encoder (gitignored; their `npm run build` regenerates it).
