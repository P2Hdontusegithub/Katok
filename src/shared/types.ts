// Types shared by server and client (type-only, erased at build time).

export type Phase = 'lobby' | 'getready' | 'question' | 'reveal' | 'race' | 'leaderboard' | 'awards' | 'teamfinal' | 'final';

/** Screens shown once the game is over, in order (`awards` steps carry an index into `awards`). */
export type EndStep = { phase: 'awards'; award: number } | { phase: 'final' } | { phase: 'teamfinal' };

export const MAX_TEAM_SIZE = 3;

export interface PublicPlayer {
  id: string;
  name: string;
  color: number;
  score: number;
  connected: boolean;
  /** Added by host from the manual scoring screen (no phone). */
  manual: boolean;
  teamId: string | null;
}

export interface PublicTeam {
  id: string;
  name: string;
  color: number;
  /** Average score of the members (0 when empty). */
  score: number;
  memberIds: string[];
}

/** What the join page / lobby needs to let a player pick a team. */
export interface TeamOption {
  id: string;
  name: string;
  color: number;
  count: number;
}

export interface QuestionPublic {
  index: number;
  total: number;
  text: string;
  answers: string[];
  image?: string;
  time: number;
  readTime: number;
  points: number;
}

export interface FeedItem {
  playerId: string;
  name: string;
  color: number;
  timeMs: number;
}

export interface RoundRow {
  rank: number;
  prevRank: number;
  playerId: string;
  name: string;
  color: number;
  choice: number | null;
  timeMs: number | null;
  correct: boolean;
  fastest: boolean;
  gained: number;
  score: number;
}

export interface RoundResult {
  questionIndex: number;
  correct: number[];
  counts: number[];
  rows: RoundRow[];
}

export type AwardKind = 'fastest' | 'mostCorrect' | 'teamBest';

export interface AwardEntry {
  playerId: string;
  name: string;
  color: number;
  teamName: string | null;
  teamColor: number | null;
  /** fastest: answer time of that single answer; mostCorrect: average time of the correct answers. */
  timeMs?: number;
  /** fastest only: which question (0-based). */
  questionIndex?: number;
  /** Number of correct answers in the whole game (mostCorrect, teamBest). */
  correct?: number;
  score?: number;
}

export interface Award {
  kind: AwardKind;
  entries: AwardEntry[];
  /** Questions that counted (multiplier > 0), for "x / N câu đúng". */
  questionCount: number;
}

export interface QuestionSetInfo {
  id: string;
  title: string;
  count: number;
  errors: string[];
}

export interface Adjustment {
  playerId: string;
  name: string;
  delta: number;
  reason: string;
  at: number;
}

export interface HostState {
  phase: Phase;
  players: PublicPlayer[];
  teams: PublicTeam[];
  questionSets: QuestionSetInfo[];
  setId: string | null;
  setTitle: string;
  question: QuestionPublic | null;
  /** Only present from the reveal phase onwards. */
  correct: number[] | null;
  /** Remaining time of the current timed phase, measured when the state was sent. */
  remainingMs: number | null;
  answeredCount: number;
  feed: FeedItem[];
  round: RoundResult | null;
  /** Special awards, available once the game is over (empty awards are left out). */
  awards: Award[];
  /** The screens after the game in order, and which one is showing (-1 = none). */
  endSteps: EndStep[];
  endIndex: number;
  adjustments: Adjustment[];
  joinUrls: string[];
  joinUrl: string;
  /** Set when phones on the LAN probably cannot reach the server (Windows firewall). */
  lanWarning: string | null;
  restored: boolean;
}

export interface PlayerResult {
  answered: boolean;
  correct: boolean;
  choice: number | null;
  correctChoices: number[];
  gained: number;
  timeMs: number | null;
}

export interface PlayerState {
  phase: Phase;
  me: { id: string; name: string; color: number; score: number; rank: number; total: number; teamId: string | null };
  myTeam: { name: string; color: number; score: number; rank: number; total: number } | null;
  question: { index: number; total: number; answerCount: number; remainingMs: number } | null;
  myAnswer: { choice: number; timeMs: number } | null;
  result: PlayerResult | null;
  /** On an award screen that lists this player: e.g. "⚡ Trả lời đúng nhanh nhất · hạng 1". */
  honor: string | null;
}

export type HostAction =
  | { type: 'start' }
  | { type: 'next' }
  | { type: 'goto'; phase: 'race' | 'leaderboard' }
  | { type: 'gotoEnd'; index: number }
  | { type: 'end' }
  | { type: 'newGame' }
  | { type: 'toLobby' }
  | { type: 'selectSet'; setId: string }
  | { type: 'reloadQuestions' }
  | { type: 'selectUrl'; url: string }
  | { type: 'kick'; playerId: string }
  | { type: 'rename'; playerId: string; name: string }
  | { type: 'addPlayer'; name: string }
  | { type: 'adjust'; changes: { playerId: string; delta: number }[]; reason: string; showRace?: boolean }
  | { type: 'setScore'; playerId: string; score: number }
  | { type: 'createTeam'; name: string; color: number }
  | { type: 'updateTeam'; teamId: string; name?: string; color?: number }
  | { type: 'deleteTeam'; teamId: string }
  | { type: 'setTeam'; playerId: string; teamId: string | null };

export interface Ack {
  ok: boolean;
  error?: string;
}

export const AWARD_TITLES: Record<AwardKind, { icon: string; title: string; short: string }> = {
  fastest: { icon: '⚡', title: 'Trả lời đúng nhanh nhất', short: 'Nhanh nhất' },
  mostCorrect: { icon: '✔', title: 'Trả lời đúng nhiều nhất', short: 'Đúng nhiều' },
  teamBest: { icon: '🌟', title: 'Xuất sắc nhất mỗi đội', short: 'Xuất sắc đội' },
};

export const ANSWER_LETTERS = ['A', 'B', 'C', 'D'];

export const PLAYER_COLORS = [
  '#ff5a5f', '#ffb400', '#00b8a9', '#7b61ff', '#ff7eb6', '#3a86ff', '#ff9f1c', '#43aa8b',
  '#e63946', '#8338ec', '#06d6a0', '#f15bb5', '#f9c80e', '#00bbf9', '#9b5de5', '#8ac926',
];
