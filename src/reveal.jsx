import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

// End-of-game reveal: the finished ladder relights itself top-to-bottom —
// each rung's changed letter pops, tinted by its share square (green = a step
// on some shortest route, amber = detour) — then END glows gold and, on a
// FRESH win, confetti falls (a big gold storm for matching par, a smaller
// green/sky burst otherwise). prefers-reduced-motion skips all of it.

function diffAt(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i;
  return -1;
}

export function Confetti({ gold }) {
  const pieces = useMemo(() => {
    const cols = gold
      ? ['#fbbf24', '#facc15', '#fde68a', '#f59e0b', '#fff7d6']
      : ['#4ade80', '#38bdf8', '#a7f3d0', '#7dd3fc'];
    const n = gold ? 72 : 30;
    return Array.from({ length: n }, (_, i) => ({
      x: Math.random() * 100,
      dur: 1700 + Math.random() * 1400,
      delay: Math.random() * 450,
      c: cols[i % cols.length],
      r0: Math.floor(Math.random() * 360),
      r1: 420 + Math.floor(Math.random() * 720),
      w: 6 + Math.random() * 5,
      h: 9 + Math.random() * 8,
    }));
  }, [gold]);
  const [on, setOn] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setOn(false), 3600);
    return () => clearTimeout(id);
  }, []);
  if (!on) return null;
  return (
    <div class="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          class="cf" key={i}
          style={
            `left:${p.x}%;width:${p.w}px;height:${p.h}px;background:${p.c};` +
            `animation-duration:${p.dur}ms;animation-delay:${p.delay}ms;` +
            `--r0:${p.r0}deg;--r1:${p.r1}deg`
          }
        />
      ))}
    </div>
  );
}

export function Reveal({ start, end, rungs, sq, isPar, celebrate, optPath }) {
  const rows = useMemo(() => [start, ...rungs], [start, rungs]);
  const rm = useMemo(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const [lit, setLit] = useState(rm ? rows.length : 0);
  const [burst, setBurst] = useState(false);
  const [tail, setTail] = useState(rm); // the line under the ladder
  const timers = useRef([]);

  useEffect(() => {
    if (rm) return undefined;
    const ts = timers.current;
    rows.forEach((_, i) => ts.push(setTimeout(() => setLit(i + 1), 150 + i * 95)));
    const endAt = 150 + rows.length * 95;
    ts.push(setTimeout(() => setTail(true), endAt + 380));
    if (celebrate) ts.push(setTimeout(() => setBurst(true), endAt + 160));
    return () => { ts.forEach(clearTimeout); timers.current = []; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const n = start.length;
  return (
    <div class="reveal">
      <div class={`ladder rev-ladder${isPar ? ' gold' : ''}`} style={`--n:${n}`}>
        {rows.map((w, i) => {
          const prev = i > 0 ? rows[i - 1] : null;
          const chg = prev ? diffAt(prev, w) : -1;
          const last = i === rows.length - 1;
          let kind = 'g';
          if (i === 0) kind = 'startr';
          else if (sq[i - 1] === '🟨') kind = 'y';
          if (last) kind += ' endr';
          return (
            <div class={`rung rrow ${kind}${i < lit ? ' lit' : ''}`} key={i}>
              <span class="rlab">{i === 0 ? 'START' : last ? 'END' : i}</span>
              <div class="tiles">
                {w.split('').map((ch, j) => (
                  <span class={`tile${j === chg ? ' chg' : ''}`} key={j}>{ch}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {isPar
        ? <div class={`opt goldline${tail ? ' on' : ''}`}>🏆 {rungs.length} moves — this ladder can't be climbed faster</div>
        : optPath
          ? <div class={`opt${tail ? ' on' : ''}`}>a par route: {optPath.join(' → ')}</div>
          : null}
      {burst && <Confetti gold={isPar} />}
    </div>
  );
}
