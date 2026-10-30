import { PLAYER_COLORS } from '../../shared/types';

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + (amt < 0 ? v : 255 - v) * amt)));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

/** Cartoon racehorse facing right. Add class "running" to make it gallop. */
export function horseSvg(colorIndex: number, extraClass = ''): string {
  const body = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length];
  const dark = shade(body, -0.28);
  const mane = shade(body, -0.5);
  const leg = (cls: string, x: number, fill: string) => `
    <g class="leg ${cls}" style="transform-origin:${x + 5}px 58px">
      <rect x="${x}" y="55" width="10" height="27" rx="5" fill="${fill}"/>
      <rect x="${x - 1.5}" y="78" width="13" height="8" rx="3.5" fill="#3d2a1f"/>
    </g>`;
  return `
  <svg class="horse ${extraClass}" viewBox="0 0 140 96" aria-hidden="true">
    <ellipse class="horse-shadow" cx="68" cy="90" rx="44" ry="5" fill="rgba(0,0,0,.18)"/>
    <g class="horse-bob">
      <path class="tail" d="M30 42 C 14 36, 6 50, 6 68 C 16 60, 22 54, 32 52 Z" fill="${mane}"/>
      ${leg('leg-bl', 33, dark)}
      ${leg('leg-fl', 85, dark)}
      <ellipse cx="62" cy="48" rx="37" ry="19" fill="${body}"/>
      <path d="M82 40 L98 14 L115 20 L100 54 Z" fill="${body}"/>
      <path d="M99 9 Q 112 2 127 17 Q 136 26 129 33 Q 120 36 107 29 Z" fill="${body}"/>
      <path d="M103 11 L105 0 L111 9 Z" fill="${body}"/>
      <path d="M99 10 Q 90 26 81 40 L 89 44 Q 96 28 106 15 Z" fill="${mane}"/>
      <circle cx="115" cy="17" r="3" fill="#fff"/>
      <circle cx="116" cy="17" r="1.8" fill="#1d1d1d"/>
      <circle cx="128" cy="28" r="1.4" fill="#1d1d1d"/>
      ${leg('leg-br', 40, body)}
      ${leg('leg-fr', 92, body)}
      <path d="M48 33 Q 62 25 76 33 L 74 40 L 50 40 Z" fill="#fff" stroke="${dark}" stroke-width="1.5"/>
      <g class="jockey">
        <path d="M57 33 Q 58 17 70 13 L 79 17 Q 71 23 69 35 Z" fill="#fff" stroke="${dark}" stroke-width="1.5"/>
        <path d="M60 24 L 77 18" stroke="${body}" stroke-width="4" stroke-linecap="round"/>
        <path d="M74 20 Q 86 24 96 26" stroke="#ffd7b0" stroke-width="3.5" stroke-linecap="round" fill="none"/>
        <circle cx="77" cy="9" r="7" fill="#ffd7b0"/>
        <path d="M69.5 8 A 7.5 7.5 0 0 1 84.5 8 L 87 9 L 69.5 9 Z" fill="${body}" stroke="${dark}" stroke-width="1.2"/>
      </g>
    </g>
  </svg>`;
}

export function playerColor(i: number) {
  return PLAYER_COLORS[i % PLAYER_COLORS.length];
}
