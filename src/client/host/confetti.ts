const COLORS = ['#ef3b4f', '#2f7cf6', '#f5a500', '#2fb344', '#ff7eb6', '#9b5de5', '#ffffff'];

/** Full-screen confetti burst for `ms` milliseconds. */
export function confetti(ms = 6000) {
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  const dpr = window.devicePixelRatio || 1;
  const resize = () => {
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
  };
  resize();
  const pieces = Array.from({ length: 220 }, () => ({
    x: Math.random() * canvas.width,
    y: -Math.random() * canvas.height,
    w: (6 + Math.random() * 8) * dpr,
    h: (8 + Math.random() * 10) * dpr,
    vy: (2 + Math.random() * 4) * dpr,
    vx: (Math.random() - 0.5) * 2 * dpr,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    c: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));
  const t0 = performance.now();
  const step = (t: number) => {
    const fading = t - t0 > ms;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = 0;
    for (const p of pieces) {
      p.x += p.vx + Math.sin((t + p.y) / 400) * dpr;
      p.y += p.vy;
      p.rot += p.vr;
      if (p.y > canvas.height + 20) {
        if (fading) continue;
        p.y = -20;
      }
      alive++;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)));
      ctx.restore();
    }
    if (alive) requestAnimationFrame(step);
    else canvas.remove();
  };
  requestAnimationFrame(step);
}
