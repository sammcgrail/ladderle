// Light answer-obfuscation for Sortle. NOT security — just enough that you can't
// pop devtools / view-source and read today's (or every future day's) correct
// order + values. EVERYTHING except {n, date} ships XOR'd with a per-day
// keystream and base64'd. A determined reverse engineer can still recover it —
// fine; the goal is "not view-source-trivial."
const SALT = 'sortle::no-peeking::v1';

// deterministic keystream of n bytes from a seed string (FNV-1a seed -> xorshift32)
function keystream(seed, n) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let x = h || 0x9e3779b9;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    out[i] = x & 0xff;
  }
  return out;
}

export function encode(obj, date) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  const ks = keystream(SALT + date, bytes.length);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] ^ ks[i]);
  return btoa(bin);
}

export function decode(enc, date) {
  const bin = atob(enc);
  const n = bin.length;
  const ks = keystream(SALT + date, n);
  const bytes = new Uint8Array(n);
  for (let i = 0; i < n; i++) bytes[i] = bin.charCodeAt(i) ^ ks[i];
  return JSON.parse(new TextDecoder().decode(bytes));
}
