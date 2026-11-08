// All point rules live here so they are easy to change later.
// Tweak the numbers in config.json → "scoring" without touching code.
import type { ScoringConfig } from './config';

export interface ScoreInput {
  answered: boolean;
  correct: boolean;
  timeMs: number;
  limitMs: number;
  /** 0 = fastest correct answer, 1 = second fastest… (-1 if not correct). */
  speedRank: number;
  /** Per-question multiplier from the JSON ("points": 2 = double points). */
  multiplier: number;
}

export function scoreAnswer(input: ScoreInput, cfg: ScoringConfig): number {
  if (!input.answered) return Math.round(cfg.noAnswerPoints * input.multiplier);
  if (!input.correct) return Math.round(cfg.wrongPoints * input.multiplier);
  const frac = Math.min(1, Math.max(0, input.timeMs / input.limitMs));
  const base = cfg.minPoints + (cfg.maxPoints - cfg.minPoints) * (1 - frac);
  const bonus = input.speedRank >= 0 ? cfg.speedBonus[input.speedRank] ?? 0 : 0;
  return Math.round((base + bonus) * input.multiplier);
}
