# Ladderle — infra notes (build/deploy plumbing agent)

Scope owned here: `encode-puzzles.mjs`, `test/validate.mjs`, `Dockerfile`, `nginx.conf`,
`docker-compose.yml`, `vite.config.js`, `package.json`, the Caddy route.
NOT touched: `src/app.jsx`, `src/styles.css`, `src/reveal.jsx`, `src/puzzles.js`,
`src/words.js`, `tools/` (other agents own those).

## Status checkpoints

- [x] validator (`test/validate.mjs`) written + fixture-tested — 11 cases: good set OK;
      date gap / dup date / future day-1 / par!=path-1 / two-letter jump / rung-not-in-dict /
      BFS-beatable par (prints the shorter path) / endpoint mismatch / n out of sequence /
      missing module all FAIL with exit 1 and the right message.
- [x] encoder (`encode-puzzles.mjs`) written + fixture-tested — clear fields exactly
      {n,date,start,end,len,par}, `path` only in blob; independent decode audit passed;
      gap/dup/endpoint/missing-module hard-fail; no output file left behind on failure;
      leak guard proven against BOTH a no-op cipher (base64 sanity) and a btoa-without-XOR
      cipher (inner-layer needle scan). Fixture env overrides: LADDERLE_PUZZLES /
      LADDERLE_WORDS / LADDERLE_ENC_OUT (never set in the real build).
- [x] package.json wires validate FIRST: `build` = `node test/validate.mjs && node
      encode-puzzles.mjs && vite build` (dev + prebuild same; `npm run validate` standalone) —
      mirrors vennle exactly.
- [x] package-lock.json generated (Dockerfile `npm ci` needs it)
- [x] container E2E (fixture build in /tmp/ladderle-e2e — repo untouched): `npm run build`
      inside the image runs validate → encode → vite; a bad set (wrong par) ABORTS
      `docker build` with the BFS diagnosis printed; good set built + served. Verified by
      CONTENT on http://localhost:20069 — title, stub marker in the JS bundle, public
      fields minified as `start:"COLD",end:"WARM",len:4,par:4,enc:"…"`, zero plaintext
      rungs, icon probes 204 (never HTML), /assets/ immutable + index no-cache, SPA
      fallback works. NOTE: real app will legitimately contain dict WORDS (SPEC ships the
      dictionary); the secret is the path SEQUENCE, which stays cipher-only.
- [x] a STUB container is RUNNING as compose project `ladderle` (container `ladderle`,
      port 20069, dark "warming up" page) — started from the /tmp copy with `-p ladderle`
      so labels match: a later `cd /root/ladderle && docker compose up --build -d`
      recreates it IN PLACE with the real app, no name conflict, no manual rm needed.
- [x] Caddy route added to /root/box/app/Caddyfile (exact vennle block shape, port
      20069) + validated INSIDE running box-web-1: `docker cp … && docker exec box-web-1
      caddy validate --adapter caddyfile --config /tmp/C` → "Valid configuration", exit 0.
      (⚠ the --adapter flag is REQUIRED when the copy isn't literally named "Caddyfile" —
      without it caddy tries JSON and errors on '#'.) box-web NOT rebuilt/restarted (parent
      deploys with the homepage card).
- [x] DNS: proxied A record ladderle.sebland.com -> 204.168.135.168 created via CF API.
- [x] repos committed (ladderle: infra files on main, pushed; box: Caddyfile only)

## Deploy sequence once content lands (for the parent)

```bash
cd /root/ladderle && npm run validate            # optional pre-flight; build gate reruns it
docker compose up --build -d                     # swaps the stub in place on 20069
curl -s http://localhost:20069/ | grep -o '<title>[^<]*</title>'   # content check at origin
cd /root/box && docker compose build web && docker compose up -d web   # ships the Caddy route (+ homepage card)
/root/seb/scripts/cf-purge
/root/seb/scripts/verify-url https://ladderle.sebland.com --title-matches 'Ladderle' --not-fallback
/root/seb/skills/sebland-app/scripts/check-mobile.py https://ladderle.sebland.com   # gate on BUILT dist
/root/seb/scripts/visual-verify --url https://ladderle.sebland.com --cachebust
```
Also still owed by parent: homepage card, status-dashboard entry (`app_containers` in
/root/seb/services/status/server.py), post-deploy subagent review.

## Contracts the content agent must honor

- `src/puzzles.js`: `export const PUZZLES = [{ n, date, start, end, len, par, path }]`
  exactly per SPEC.md. Words UPPERCASE A–Z.
- `src/words.js`: `export const WORDS = [...]` (Array or Set; any case — validator
  normalizes to uppercase). Default export also accepted. Every rung of every path,
  including start/end, must be in it.
- par MUST equal the true BFS-shortest distance **over the shipped `src/words.js`** —
  the validator re-derives it. A larger shipped dict that admits a shorter path than
  the generation set = players beat par = validator hard-fails with the shorter path.

## Environment facts

- Port 20069 free (sortle=20066, vennle=20068). Compose maps 20069:8080, `network_mode: bridge`.
- No DNS record for ladderle.sebland.com yet (checked CF API) — adding A record here.
- Repo had no commits / no remote at start of my work.
- `src/cipher.js` SALT still says `sortle::no-peeking::v1` (scaffold artifact). Functionally
  fine — encoder + app import the same module, so encode/decode always agree. Left alone
  (not my file); optional cosmetic cleanup for whoever owns it.
- `index.html` meta description + favicon are still Sortle's bar-chart icon (scaffold
  artifact) — app agent / parent should re-skin. Not mine.
- Status-dashboard registration (`/root/seb/services/status/server.py` app_containers)
  + homepage card + box-web rebuild/deploy = parent's, per task ("I'll deploy it with
  the homepage card").
