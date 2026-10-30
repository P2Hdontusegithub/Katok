export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((out, s, i) => out + s + (i < values.length ? String(values[i] ?? '') : ''), '');
}

export const fmtPoints = (n: number) => Math.round(n).toLocaleString('vi-VN');
export const fmtTime = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(2)}s`);

let toastTimer = 0;
export function toast(msg: string, kind: 'info' | 'error' | 'ok' = 'info') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), 3200);
}

/** Smoothly counts a number element up/down to a target value. */
export function countTo(el: HTMLElement, to: number, ms = 900) {
  const from = Number(el.dataset.value ?? 0);
  el.dataset.value = String(to);
  const t0 = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmtPoints(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Floating background shapes used on every page. */
export function decorateBackground() {
  if (document.querySelector('.bg-shapes')) return;
  const wrap = document.createElement('div');
  wrap.className = 'bg-shapes';
  const kinds = ['tri', 'dia', 'cir', 'sq'];
  for (let i = 0; i < 14; i++) {
    const s = document.createElement('span');
    s.className = `bg-shape ${kinds[i % 4]}`;
    s.style.left = `${(i * 37) % 100}%`;
    s.style.animationDelay = `${-i * 2.3}s`;
    s.style.animationDuration = `${18 + (i % 5) * 4}s`;
    s.style.setProperty('--size', `${40 + ((i * 13) % 70)}px`);
    wrap.appendChild(s);
  }
  document.body.prepend(wrap);
}
