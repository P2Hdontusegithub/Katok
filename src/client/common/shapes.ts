// The four answer shapes (triangle, diamond, circle, square) and their colors.
export const ANSWER_COLORS = ['#ef3b4f', '#2f7cf6', '#f5a500', '#2fb344'];
export const ANSWER_NAMES = ['tri', 'dia', 'cir', 'sq'];

const PATHS = [
  '<path d="M50 8 L94 88 L6 88 Z"/>',
  '<path d="M50 4 L96 50 L50 96 L4 50 Z"/>',
  '<circle cx="50" cy="50" r="44"/>',
  '<rect x="8" y="8" width="84" height="84" rx="6"/>',
];

export function shapeSvg(i: number, cls = 'shape'): string {
  return `<svg class="${cls}" viewBox="0 0 100 100" fill="currentColor" aria-hidden="true">${PATHS[i]}</svg>`;
}
