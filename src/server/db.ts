// Local SQLite database (built into Node ≥ 22.13, no native install needed).
// Stores every answer / manual adjustment / final result, plus a snapshot of
// the running game so a crashed or restarted server can resume.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface AnswerLog {
  gameId: string;
  questionIndex: number;
  questionText: string;
  playerId: string;
  playerName: string;
  choice: number | null;
  timeMs: number | null;
  correct: boolean;
  points: number;
}

export class Db {
  private db: DatabaseSync;

  constructor(file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY, set_id TEXT, set_title TEXT,
        started_at INTEGER, ended_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT, game_id TEXT, question_index INTEGER, question_text TEXT,
        player_id TEXT, player_name TEXT, choice INTEGER, time_ms INTEGER, correct INTEGER, points INTEGER,
        created_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS adjustments (
        id INTEGER PRIMARY KEY AUTOINCREMENT, game_id TEXT, player_id TEXT, player_name TEXT,
        delta INTEGER, reason TEXT, created_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS results (
        game_id TEXT, player_id TEXT, player_name TEXT, score INTEGER, rank INTEGER,
        PRIMARY KEY (game_id, player_id)
      );
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);
    `);
  }

  startGame(id: string, setId: string, setTitle: string) {
    this.db.prepare('INSERT OR IGNORE INTO games (id, set_id, set_title, started_at) VALUES (?, ?, ?, ?)').run(id, setId, setTitle, Date.now());
  }

  logAnswers(rows: AnswerLog[]) {
    const stmt = this.db.prepare(
      'INSERT INTO answers (game_id, question_index, question_text, player_id, player_name, choice, time_ms, correct, points, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const now = Date.now();
    this.db.exec('BEGIN');
    for (const r of rows) {
      stmt.run(r.gameId, r.questionIndex, r.questionText, r.playerId, r.playerName, r.choice, r.timeMs, r.correct ? 1 : 0, r.points, now);
    }
    this.db.exec('COMMIT');
  }

  logAdjustment(gameId: string, playerId: string, playerName: string, delta: number, reason: string) {
    this.db
      .prepare('INSERT INTO adjustments (game_id, player_id, player_name, delta, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(gameId, playerId, playerName, delta, reason, Date.now());
  }

  finishGame(gameId: string, results: { playerId: string; name: string; score: number; rank: number }[]) {
    const stmt = this.db.prepare('INSERT OR REPLACE INTO results (game_id, player_id, player_name, score, rank) VALUES (?, ?, ?, ?, ?)');
    this.db.exec('BEGIN');
    for (const r of results) stmt.run(gameId, r.playerId, r.name, r.score, r.rank);
    this.db.prepare('UPDATE games SET ended_at = ? WHERE id = ?').run(Date.now(), gameId);
    this.db.exec('COMMIT');
  }

  /** Points per question for a game, used by the CSV export. */
  answersFor(gameId: string): { question_index: number; player_id: string; points: number; time_ms: number | null; correct: number }[] {
    return this.db
      .prepare('SELECT question_index, player_id, points, time_ms, correct FROM answers WHERE game_id = ? ORDER BY id')
      .all(gameId) as any;
  }

  adjustmentsFor(gameId: string): { player_id: string; delta: number }[] {
    return this.db.prepare('SELECT player_id, delta FROM adjustments WHERE game_id = ?').all(gameId) as any;
  }

  setValue(key: string, value: string) {
    this.db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(key, value);
  }

  getValue(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  saveSnapshot(json: string) {
    this.setValue('snapshot', json);
  }

  loadSnapshot(): string | null {
    return this.getValue('snapshot');
  }
}
