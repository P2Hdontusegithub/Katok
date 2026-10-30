import fs from 'node:fs';
import path from 'node:path';

export interface ScoringConfig {
  /** Points for a correct answer given instantly. */
  maxPoints: number;
  /** Points for a correct answer given at the very last moment. */
  minPoints: number;
  wrongPoints: number;
  noAnswerPoints: number;
  /** Extra points for the 1st, 2nd, 3rd… fastest correct answers. */
  speedBonus: number[];
}

export interface Config {
  port: number;
  hostPassword: string;
  publicUrl: string;
  latencyCompensationMs: number;
  autoEndWhenAllAnswered: boolean;
  maxPlayers: number;
  scoring: ScoringConfig;
}

export const ROOT = path.resolve(__dirname, '..');

const DEFAULTS: Config = {
  port: 3000,
  hostPassword: 'katok2026',
  publicUrl: '',
  latencyCompensationMs: 800,
  autoEndWhenAllAnswered: true,
  maxPlayers: 150,
  scoring: { maxPoints: 1000, minPoints: 500, wrongPoints: 0, noAnswerPoints: 0, speedBonus: [300, 200, 100] },
};

export function loadConfig(): Config {
  const file = path.join(ROOT, 'config.json');
  let user: Partial<Config> = {};
  try {
    user = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (fs.existsSync(file)) console.error(`⚠️  Không đọc được config.json (${(err as Error).message}) — dùng cấu hình mặc định.`);
  }
  const cfg: Config = { ...DEFAULTS, ...user, scoring: { ...DEFAULTS.scoring, ...(user.scoring ?? {}) } };
  if (process.env.PORT) cfg.port = Number(process.env.PORT);
  if (process.env.HOST_PASSWORD) cfg.hostPassword = process.env.HOST_PASSWORD;
  if (process.env.PUBLIC_URL) cfg.publicUrl = process.env.PUBLIC_URL;
  return cfg;
}
