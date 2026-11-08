import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type {
  Ack, Adjustment, FeedItem, HostState, Phase, PlayerState, PublicPlayer, PublicTeam, RoundResult, RoundRow, TeamOption,
} from '../shared/types';
import { MAX_TEAM_SIZE, PLAYER_COLORS } from '../shared/types';
import type { Config } from './config';
import type { Db } from './db';
import { prepareQuestions, setInfo, type Question, type QuestionSet } from './questions';
import { scoreAnswer } from './scoring';

interface Player {
  id: string;
  token: string;
  name: string;
  color: number;
  score: number;
  socketId: string | null;
  manual: boolean;
  teamId: string | null;
}

interface Team {
  id: string;
  name: string;
  color: number;
}

interface Answer {
  choice: number;
  timeMs: number;
  at: number;
}

export interface GameEvents {
  /** Something changed for everyone (phase, scores, players…). */
  all(): void;
  /** Only hosts need an update (e.g. a new answer arrived). */
  hosts(): void;
  player(id: string): void;
  kicked(socketId: string): void;
}

const ANSWER_GRACE_MS = 300;

const newId = (bytes = 6) => randomBytes(bytes).toString('hex');

export class Game {
  phase: Phase = 'lobby';
  private players = new Map<string, Player>();
  private teams: Team[] = [];
  private sets: QuestionSet[] = [];
  private setId: string | null = null;
  private started = false;
  private questions: Question[] = [];
  private qIndex = -1;
  private answers = new Map<string, Answer>();
  private phaseStart = 0;
  private phaseDuration = 0;
  private timer: NodeJS.Timeout | null = null;
  private round: RoundResult | null = null;
  private adjustments: Adjustment[] = [];
  private gameId = newId();
  private restored = false;
  joinUrls: string[] = [];
  joinUrl = '';

  constructor(
    private cfg: Config,
    private db: Db,
    private events: GameEvents,
    private onFinish: (gameId: string) => void,
  ) {}

  // ───────────────────────── question sets ─────────────────────────

  setQuestionSets(sets: QuestionSet[]) {
    this.sets = sets;
    if (!this.setId || !sets.some((s) => s.id === this.setId)) {
      this.setId = sets.find((s) => s.questions.length)?.id ?? null;
    }
  }

  private get currentSet() {
    return this.sets.find((s) => s.id === this.setId) ?? null;
  }

  // ───────────────────────── players ─────────────────────────

  join(
    socketId: string,
    name: string | undefined,
    token: string | undefined,
    teamId?: string | null,
  ): Ack & { token?: string; playerId?: string } {
    if (token) {
      const p = [...this.players.values()].find((pl) => pl.token === token);
      if (p) {
        p.socketId = socketId;
        this.changed();
        return { ok: true, token: p.token, playerId: p.id };
      }
      if (!name) return { ok: false, error: 'unknown-token' };
    }
    const clean = (name ?? '').replace(/\s+/g, ' ').trim().slice(0, 20);
    if (!clean) return { ok: false, error: 'Nhập tên của bạn nhé!' };
    if (this.findByName(clean)) return { ok: false, error: 'Tên này đã có người dùng, chọn tên khác nhé.' };
    if (this.players.size >= this.cfg.maxPlayers) return { ok: false, error: 'Phòng đã đủ người chơi.' };
    // While some team still has room, picking one is required.
    const options = this.teamOptions();
    let team: TeamOption | undefined;
    if (options.some((t) => t.count < MAX_TEAM_SIZE)) {
      team = options.find((o) => o.id === teamId);
      if (!team) return { ok: false, error: 'Chọn đội của bạn nhé!' };
      if (team.count >= MAX_TEAM_SIZE) return { ok: false, error: `Đội ${team.name} đã đủ ${MAX_TEAM_SIZE} người.` };
    }
    const p = this.createPlayer(clean, false);
    p.socketId = socketId;
    if (team) p.teamId = team.id;
    this.changed();
    return { ok: true, token: p.token, playerId: p.id };
  }

  private findByName(name: string) {
    const key = name.toLocaleLowerCase('vi');
    return [...this.players.values()].find((p) => p.name.toLocaleLowerCase('vi') === key);
  }

  private createPlayer(name: string, manual: boolean): Player {
    const p: Player = {
      id: newId(),
      token: newId(16),
      name,
      color: this.freeColor(),
      score: 0,
      socketId: null,
      manual,
      teamId: null,
    };
    this.players.set(p.id, p);
    return p;
  }

  /** Least-used colour for a player without a team; team colours are avoided. */
  private freeColor(): number {
    const used = PLAYER_COLORS.map(() => 0);
    for (const t of this.teams) used[t.color] += 1000;
    for (const p of this.players.values()) if (!p.teamId) used[p.color]++;
    const min = Math.min(...used);
    const free = used.map((n, i) => (n === min ? i : -1)).filter((i) => i >= 0);
    return free[Math.floor(Math.random() * free.length)];
  }

  /** Team members race in the team colour. */
  private colorOf(p: Player): number {
    return this.teamOf(p)?.color ?? p.color;
  }

  private teamOf(p: Player) {
    return p.teamId ? this.teams.find((t) => t.id === p.teamId) ?? null : null;
  }

  disconnect(socketId: string) {
    for (const p of this.players.values()) {
      if (p.socketId === socketId) {
        p.socketId = null;
        this.events.hosts();
        this.maybeAllAnswered();
      }
    }
  }

  playerBySocket(socketId: string) {
    return [...this.players.values()].find((p) => p.socketId === socketId) ?? null;
  }

  socketOf(playerId: string) {
    return this.players.get(playerId)?.socketId ?? null;
  }

  playerIds() {
    return [...this.players.keys()];
  }

  changeColor(playerId: string): Ack {
    const p = this.players.get(playerId);
    if (!p) return { ok: false };
    if (this.teamOf(p)) return { ok: false, error: 'Ngựa trong đội dùng màu của đội.' };
    const taken = new Set(this.teams.map((t) => t.color));
    for (let i = 1; i <= PLAYER_COLORS.length; i++) {
      const c = (p.color + i) % PLAYER_COLORS.length;
      if (!taken.has(c)) {
        p.color = c;
        break;
      }
    }
    this.changed();
    return { ok: true };
  }

  // ───────────────────────── teams ─────────────────────────

  private cleanTeamName(name: string) {
    return name.replace(/\s+/g, ' ').trim().slice(0, 12);
  }

  private teamNameTaken(name: string, exceptId?: string) {
    const key = name.toLocaleLowerCase('vi');
    return this.teams.some((t) => t.id !== exceptId && t.name.toLocaleLowerCase('vi') === key);
  }

  private validTeamColor(color: number, exceptId?: string): string | null {
    if (!Number.isInteger(color) || color < 0 || color >= PLAYER_COLORS.length) return 'Màu không hợp lệ.';
    if (this.teams.some((t) => t.id !== exceptId && t.color === color)) return 'Màu này đội khác đã chọn.';
    return null;
  }

  /** Players can only pick or switch teams before the game starts. */
  private get teamsOpen() {
    return !this.started;
  }

  createTeam(name: string, color: number): Ack {
    if (!this.teamsOpen) return { ok: false, error: 'Chỉ tạo đội khi đang ở sảnh chờ.' };
    const clean = this.cleanTeamName(name);
    if (!clean) return { ok: false, error: 'Nhập tên đội.' };
    if (this.teamNameTaken(clean)) return { ok: false, error: 'Tên đội đã tồn tại.' };
    const bad = this.validTeamColor(color);
    if (bad) return { ok: false, error: bad };
    this.teams.push({ id: newId(), name: clean, color });
    // Players without a team who happened to have this colour get another one.
    for (const p of this.players.values()) if (!p.teamId && p.color === color) p.color = this.freeColor();
    this.changed();
    return { ok: true };
  }

  updateTeam(teamId: string, name?: string, color?: number): Ack {
    const t = this.teams.find((x) => x.id === teamId);
    if (!t) return { ok: false, error: 'Không tìm thấy đội.' };
    if (name !== undefined) {
      const clean = this.cleanTeamName(name);
      if (!clean) return { ok: false, error: 'Nhập tên đội.' };
      if (this.teamNameTaken(clean, t.id)) return { ok: false, error: 'Tên đội đã tồn tại.' };
      t.name = clean;
    }
    if (color !== undefined) {
      const bad = this.validTeamColor(color, t.id);
      if (bad) return { ok: false, error: bad };
      t.color = color;
      for (const p of this.players.values()) if (!p.teamId && p.color === color) p.color = this.freeColor();
    }
    this.changed();
    return { ok: true };
  }

  deleteTeam(teamId: string): Ack {
    if (!this.teamsOpen) return { ok: false, error: 'Chỉ xoá đội khi đang ở sảnh chờ.' };
    if (!this.teams.some((t) => t.id === teamId)) return { ok: false, error: 'Không tìm thấy đội.' };
    this.teams = this.teams.filter((t) => t.id !== teamId);
    for (const p of this.players.values()) {
      if (p.teamId === teamId) {
        p.teamId = null;
        p.color = this.freeColor();
      }
    }
    this.changed();
    return { ok: true };
  }

  setTeam(playerId: string, teamId: string | null): Ack {
    const p = this.players.get(playerId);
    if (!p) return { ok: false, error: 'Không tìm thấy người chơi.' };
    if (!this.teamsOpen) return { ok: false, error: 'Trò chơi đã bắt đầu, không đổi đội được nữa.' };
    if (teamId === p.teamId) return { ok: true };
    if (teamId === null) {
      p.teamId = null;
      p.color = this.freeColor();
    } else {
      const t = this.teams.find((x) => x.id === teamId);
      if (!t) return { ok: false, error: 'Không tìm thấy đội.' };
      const count = [...this.players.values()].filter((o) => o.teamId === t.id).length;
      if (count >= MAX_TEAM_SIZE) return { ok: false, error: `Đội ${t.name} đã đủ ${MAX_TEAM_SIZE} người.` };
      p.teamId = t.id;
    }
    this.changed();
    return { ok: true };
  }

  /** Teams players may still pick (empty once the game has started). */
  teamOptions(): TeamOption[] {
    if (!this.teamsOpen) return [];
    return this.teams.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      count: [...this.players.values()].filter((p) => p.teamId === t.id).length,
    }));
  }

  /** Teams with their average score, in creation order. */
  private teamStats(): PublicTeam[] {
    return this.teams.map((t) => {
      const members = [...this.players.values()].filter((p) => p.teamId === t.id);
      const score = members.length ? members.reduce((s, p) => s + p.score, 0) / members.length : 0;
      return { id: t.id, name: t.name, color: t.color, score, memberIds: members.map((p) => p.id) };
    });
  }

  /** Competition ranking of the teams that have members. */
  private teamRanks(): Map<string, number> {
    const list = this.teamStats().filter((t) => t.memberIds.length);
    return new Map(list.map((t) => [t.id, 1 + list.filter((o) => o.score > t.score).length]));
  }

  // ───────────────────────── answering ─────────────────────────

  answer(playerId: string, choice: number, clientElapsed: unknown): Ack {
    const p = this.players.get(playerId);
    const q = this.questions[this.qIndex];
    if (!p || this.phase !== 'question' || !q) return { ok: false, error: 'Chưa thể trả lời lúc này.' };
    if (this.answers.has(playerId)) return { ok: false, error: 'Bạn đã trả lời rồi.' };
    if (!Number.isInteger(choice) || choice < 0 || choice >= q.answers.length) return { ok: false, error: 'Đáp án không hợp lệ.' };

    const limit = this.phaseDuration;
    const serverElapsed = performance.now() - this.phaseStart;
    if (serverElapsed > limit + ANSWER_GRACE_MS) return { ok: false, error: 'Hết giờ rồi!' };
    // Trust the phone's own stopwatch (fairer on slow 4G), but only within a
    // small window below the server's measurement so it cannot be abused.
    let timeMs = serverElapsed;
    if (typeof clientElapsed === 'number' && Number.isFinite(clientElapsed)) {
      timeMs = Math.min(serverElapsed, Math.max(serverElapsed - this.cfg.latencyCompensationMs, clientElapsed));
    }
    timeMs = Math.round(Math.min(limit, Math.max(0, timeMs)));
    this.answers.set(playerId, { choice, timeMs, at: performance.now() });
    this.events.player(playerId);
    this.events.hosts();
    this.maybeAllAnswered();
    return { ok: true };
  }

  private maybeAllAnswered() {
    if (this.phase !== 'question' || !this.cfg.autoEndWhenAllAnswered) return;
    const online = [...this.players.values()].filter((p) => p.socketId && !p.manual);
    if (online.length && online.every((p) => this.answers.has(p.id))) this.endQuestion();
  }

  // ───────────────────────── flow ─────────────────────────

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private startTimed(phase: Phase, seconds: number, then: () => void) {
    this.clearTimer();
    this.phase = phase;
    this.phaseStart = performance.now();
    this.phaseDuration = seconds * 1000;
    const wait = phase === 'question' ? this.phaseDuration + ANSWER_GRACE_MS : this.phaseDuration;
    this.timer = setTimeout(then, wait);
  }

  start(): Ack {
    const set = this.currentSet;
    if (!set || !set.questions.length) return { ok: false, error: 'Chưa chọn bộ câu hỏi hợp lệ.' };
    this.questions = prepareQuestions(set);
    this.started = true;
    this.restored = false;
    this.db.startGame(this.gameId, set.id, set.title);
    this.getReady(0);
    return { ok: true };
  }

  private getReady(index: number) {
    this.qIndex = index;
    this.answers.clear();
    this.round = null;
    const q = this.questions[index];
    if (q.readTime > 0) this.startTimed('getready', q.readTime, () => this.openQuestion());
    else this.openQuestion();
    this.changed();
  }

  private openQuestion() {
    const q = this.questions[this.qIndex];
    this.startTimed('question', q.time, () => this.endQuestion());
    this.changed();
  }

  private endQuestion() {
    if (this.phase !== 'question') return;
    this.clearTimer();
    const q = this.questions[this.qIndex];
    // Rank changes are meaningless while everybody is still tied (e.g. first question).
    const before = new Set([...this.players.values()].map((p) => p.score)).size > 1 ? this.ranks() : new Map<string, number>();
    const correctTimes = [...this.answers.entries()]
      .filter(([, a]) => q.correct.includes(a.choice))
      .sort((a, b) => a[1].timeMs - b[1].timeMs || a[1].at - b[1].at)
      .map(([id]) => id);
    const counts = q.answers.map(() => 0);
    const gained = new Map<string, number>();
    for (const p of this.players.values()) {
      const a = this.answers.get(p.id);
      if (a) counts[a.choice]++;
      const pts = scoreAnswer(
        {
          answered: !!a,
          correct: !!a && q.correct.includes(a.choice),
          timeMs: a?.timeMs ?? this.phaseDuration,
          limitMs: this.phaseDuration,
          speedRank: correctTimes.indexOf(p.id),
          multiplier: q.points,
        },
        this.cfg.scoring,
      );
      gained.set(p.id, pts);
      p.score += pts;
    }
    const after = this.ranks();
    const rows: RoundRow[] = [...this.players.values()].map((p) => {
      const a = this.answers.get(p.id);
      return {
        rank: after.get(p.id) ?? 0,
        prevRank: before.get(p.id) ?? 0,
        playerId: p.id,
        name: p.name,
        color: this.colorOf(p),
        choice: a?.choice ?? null,
        timeMs: a?.timeMs ?? null,
        correct: !!a && q.correct.includes(a.choice),
        fastest: correctTimes[0] === p.id,
        gained: gained.get(p.id) ?? 0,
        score: p.score,
      };
    });
    rows.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'vi'));
    this.round = { questionIndex: this.qIndex, correct: q.correct, counts, rows };
    this.db.logAnswers(
      rows.map((r) => ({
        gameId: this.gameId,
        questionIndex: this.qIndex,
        questionText: q.text,
        playerId: r.playerId,
        playerName: r.name,
        choice: r.choice,
        timeMs: r.timeMs,
        correct: r.correct,
        points: r.gained,
      })),
    );
    this.phase = 'reveal';
    this.changed();
  }

  next(): Ack {
    switch (this.phase) {
      case 'lobby':
        return this.start();
      case 'getready':
        this.openQuestion();
        return { ok: true };
      case 'question':
        this.endQuestion();
        return { ok: true };
      case 'reveal':
        this.phase = 'race';
        break;
      case 'race':
        this.phase = 'leaderboard';
        break;
      case 'leaderboard':
        if (!this.started) return this.start();
        if (this.qIndex + 1 < this.questions.length) {
          this.getReady(this.qIndex + 1);
          return { ok: true };
        }
        this.finish();
        return { ok: true };
      case 'teamfinal':
        this.phase = 'final';
        break;
      case 'final':
        return { ok: false, error: 'Trò chơi đã kết thúc.' };
    }
    this.changed();
    return { ok: true };
  }

  goto(phase: 'race' | 'leaderboard'): Ack {
    if (this.phase === 'getready' || this.phase === 'question') return { ok: false, error: 'Đang có câu hỏi.' };
    this.phase = phase;
    this.changed();
    return { ok: true };
  }

  end(): Ack {
    if (this.phase === 'lobby' && !this.started) return { ok: false, error: 'Trò chơi chưa bắt đầu.' };
    if (this.phase === 'question') this.endQuestion();
    this.finish();
    return { ok: true };
  }

  private finish() {
    this.clearTimer();
    // The team podium comes first, then the individual one.
    this.phase = this.teamRanks().size ? 'teamfinal' : 'final';
    const ranks = this.ranks();
    if (this.started || this.adjustments.length) {
      this.db.startGame(this.gameId, this.setId ?? '', this.currentSet?.title ?? '');
      this.db.finishGame(
        this.gameId,
        [...this.players.values()].map((p) => ({ playerId: p.id, name: p.name, score: p.score, rank: ranks.get(p.id) ?? 0 })),
      );
      this.onFinish(this.gameId);
    }
    this.changed();
  }

  /** Back to the lobby. keepPlayers=false also removes everybody. */
  reset(keepPlayers: boolean) {
    this.clearTimer();
    if (!keepPlayers) {
      for (const p of this.players.values()) if (p.socketId) this.events.kicked(p.socketId);
      this.players.clear();
    }
    for (const p of this.players.values()) p.score = 0;
    this.phase = 'lobby';
    this.started = false;
    this.questions = [];
    this.qIndex = -1;
    this.answers.clear();
    this.round = null;
    this.adjustments = [];
    this.gameId = newId();
    this.restored = false;
    this.changed();
  }

  selectSet(setId: string): Ack {
    if (this.started) return { ok: false, error: 'Chỉ đổi bộ câu hỏi khi đang ở sảnh chờ.' };
    if (!this.sets.some((s) => s.id === setId)) return { ok: false, error: 'Không tìm thấy bộ câu hỏi.' };
    this.setId = setId;
    this.changed();
    return { ok: true };
  }

  // ───────────────────────── manual scoring ─────────────────────────

  kick(playerId: string): Ack {
    const p = this.players.get(playerId);
    if (!p) return { ok: false, error: 'Không tìm thấy người chơi.' };
    if (p.socketId) this.events.kicked(p.socketId);
    this.players.delete(playerId);
    this.answers.delete(playerId);
    this.changed();
    this.maybeAllAnswered();
    return { ok: true };
  }

  rename(playerId: string, name: string): Ack {
    const p = this.players.get(playerId);
    const clean = name.replace(/\s+/g, ' ').trim().slice(0, 20);
    if (!p || !clean) return { ok: false, error: 'Tên không hợp lệ.' };
    const other = this.findByName(clean);
    if (other && other.id !== p.id) return { ok: false, error: 'Tên đã tồn tại.' };
    p.name = clean;
    this.changed();
    return { ok: true };
  }

  addManualPlayer(name: string): Ack {
    const clean = name.replace(/\s+/g, ' ').trim().slice(0, 20);
    if (!clean) return { ok: false, error: 'Nhập tên người chơi.' };
    if (this.findByName(clean)) return { ok: false, error: 'Tên đã tồn tại.' };
    this.createPlayer(clean, true);
    this.changed();
    return { ok: true };
  }

  adjust(changes: { playerId: string; delta: number }[], reason: string, showRace: boolean): Ack {
    const why = reason.trim().slice(0, 80) || 'Chấm tay';
    let n = 0;
    for (const c of changes) {
      const p = this.players.get(c.playerId);
      const delta = Math.round(Number(c.delta));
      if (!p || !Number.isFinite(delta) || delta === 0) continue;
      p.score += delta;
      this.adjustments.unshift({ playerId: p.id, name: p.name, delta, reason: why, at: Date.now() });
      this.db.logAdjustment(this.gameId, p.id, p.name, delta, why);
      n++;
    }
    this.adjustments = this.adjustments.slice(0, 200);
    if (!n) return { ok: false, error: 'Không có thay đổi nào.' };
    if (showRace && this.phase !== 'getready' && this.phase !== 'question') this.phase = 'race';
    this.changed();
    return { ok: true };
  }

  setScore(playerId: string, score: number): Ack {
    const p = this.players.get(playerId);
    if (!p || !Number.isFinite(score)) return { ok: false, error: 'Điểm không hợp lệ.' };
    return this.adjust([{ playerId, delta: Math.round(score) - p.score }], 'Đặt điểm', false);
  }

  /** The "game restored" notice is shown once, to the first host that connects. */
  clearRestoredFlag() {
    this.restored = false;
  }

  // ───────────────────────── state views ─────────────────────────

  /** Competition ranking (ties share a rank). */
  private ranks(): Map<string, number> {
    const list = [...this.players.values()];
    return new Map(list.map((p) => [p.id, 1 + list.filter((o) => o.score > p.score).length]));
  }

  private publicPlayers(): PublicPlayer[] {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      color: this.colorOf(p),
      score: p.score,
      connected: !!p.socketId,
      manual: p.manual,
      teamId: this.teamOf(p)?.id ?? null,
    }));
  }

  private remaining(): number | null {
    if (this.phase !== 'getready' && this.phase !== 'question') return null;
    return Math.max(0, Math.round(this.phaseStart + this.phaseDuration - performance.now()));
  }

  hostState(): HostState {
    const q = this.questions[this.qIndex];
    const showQ = q && this.phase !== 'lobby' && this.phase !== 'final';
    const hidden = this.phase === 'getready' || this.phase === 'question';
    const feed: FeedItem[] = [...this.answers.entries()]
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, 40)
      .flatMap(([id, a]) => {
        const p = this.players.get(id);
        return p ? [{ playerId: id, name: p.name, color: this.colorOf(p), timeMs: a.timeMs }] : [];
      });

    let round = this.round;
    if (round) {
      // Totals in the table always reflect the latest scores (incl. manual changes).
      const ranks = this.ranks();
      const rows = round.rows
        .filter((r) => this.players.has(r.playerId))
        .map((r) => {
          const p = this.players.get(r.playerId)!;
          return { ...r, name: p.name, color: this.colorOf(p), score: p.score, rank: ranks.get(p.id) ?? r.rank };
        })
        .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'vi'));
      round = { ...round, rows };
    }

    return {
      phase: this.phase,
      players: this.publicPlayers(),
      teams: this.teamStats(),
      questionSets: this.sets.map(setInfo),
      setId: this.setId,
      setTitle: this.currentSet?.title ?? '',
      question: showQ
        ? {
            index: this.qIndex,
            total: this.questions.length,
            text: q.text,
            answers: q.answers,
            image: q.image,
            time: q.time,
            readTime: q.readTime,
            points: q.points,
          }
        : null,
      correct: showQ && !hidden ? q.correct : null,
      remainingMs: this.remaining(),
      answeredCount: this.answers.size,
      feed: this.phase === 'question' || this.phase === 'reveal' ? feed : [],
      round,
      adjustments: this.adjustments.slice(0, 50),
      joinUrls: this.joinUrls,
      joinUrl: this.joinUrl,
      restored: this.restored,
    };
  }

  playerState(playerId: string): PlayerState | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    const q = this.questions[this.qIndex];
    const timed = this.phase === 'getready' || this.phase === 'question';
    const a = this.answers.get(p.id);
    const row = this.round?.rows.find((r) => r.playerId === p.id);
    const showResult = row && (this.phase === 'reveal' || this.phase === 'race' || this.phase === 'leaderboard');
    const team = this.teamOf(p);
    const teamRanks = this.teamRanks();
    const teamStat = team && this.teamStats().find((t) => t.id === team.id);
    return {
      phase: this.phase,
      me: {
        id: p.id,
        name: p.name,
        color: this.colorOf(p),
        score: p.score,
        rank: this.ranks().get(p.id) ?? 0,
        total: this.players.size,
        teamId: team?.id ?? null,
      },
      myTeam: teamStat
        ? { name: teamStat.name, color: teamStat.color, score: teamStat.score, rank: teamRanks.get(teamStat.id) ?? 0, total: teamRanks.size }
        : null,
      question: q && timed ? { index: this.qIndex, total: this.questions.length, answerCount: q.answers.length, remainingMs: this.remaining() ?? 0 } : null,
      myAnswer: a && this.phase === 'question' ? { choice: a.choice, timeMs: a.timeMs } : null,
      result: showResult
        ? {
            answered: row.choice !== null,
            correct: row.correct,
            choice: row.choice,
            correctChoices: this.round!.correct,
            gained: row.gained,
            timeMs: row.timeMs,
          }
        : null,
    };
  }

  /** Data for the CSV export of the current game. */
  exportRows(): { header: string[]; rows: (string | number)[][] } {
    const answers = this.db.answersFor(this.gameId);
    const adj = this.db.adjustmentsFor(this.gameId);
    const qCount = Math.max(this.questions.length, ...answers.map((a) => a.question_index + 1), 0);
    const ranks = this.ranks();
    const hasTeams = this.teams.length > 0;
    const header = [
      'Hạng', 'Người chơi', ...(hasTeams ? ['Đội'] : []),
      ...Array.from({ length: qCount }, (_, i) => `Câu ${i + 1}`), 'Chấm tay', 'Tổng điểm',
    ];
    const rows: (string | number)[][] = [...this.players.values()]
      .sort((a, b) => b.score - a.score)
      .map((p) => {
        const per = Array.from({ length: qCount }, (_, i) =>
          answers.filter((a) => a.player_id === p.id && a.question_index === i).reduce((s, a) => s + a.points, 0),
        );
        const manual = adj.filter((a) => a.player_id === p.id).reduce((s, a) => s + a.delta, 0);
        return [ranks.get(p.id) ?? 0, p.name, ...(hasTeams ? [this.teamOf(p)?.name ?? ''] : []), ...per, manual, p.score];
      });
    if (hasTeams) {
      const teamRanks = this.teamRanks();
      rows.push([], ['Hạng đội', 'Đội', 'Thành viên', 'Điểm đội (trung bình)']);
      for (const t of this.teamStats().filter((x) => x.memberIds.length).sort((a, b) => b.score - a.score)) {
        const names = t.memberIds.map((id) => this.players.get(id)!.name).join(' · ');
        rows.push([teamRanks.get(t.id) ?? 0, t.name, names, Math.round(t.score)]);
      }
    }
    return { header, rows };
  }

  // ───────────────────────── persistence ─────────────────────────

  private changed() {
    this.persist();
    this.events.all();
  }

  private persist() {
    try {
      this.db.saveSnapshot(
        JSON.stringify({
          v: 1,
          gameId: this.gameId,
          started: this.started,
          setId: this.setId,
          questions: this.questions,
          qIndex: this.qIndex,
          phase: this.phase,
          players: [...this.players.values()].map((p) => ({ ...p, socketId: null })),
          teams: this.teams,
          round: this.round,
          adjustments: this.adjustments,
        }),
      );
    } catch (err) {
      console.error('Không lưu được snapshot:', err);
    }
  }

  /** Restore the game saved before a restart. Returns true when something was restored. */
  restore(json: string | null): boolean {
    if (!json) return false;
    try {
      const s = JSON.parse(json);
      if (s.v !== 1) return false;
      // Teams are host setup: keep them even when there is no game worth restoring.
      this.teams = s.teams ?? [];
      if (!s.players?.length && !s.started) return false;
      this.gameId = s.gameId;
      this.started = s.started;
      if (s.setId) this.setId = s.setId;
      this.questions = s.questions ?? [];
      this.qIndex = s.qIndex ?? -1;
      this.players = new Map((s.players as Player[]).map((p) => [p.id, { ...p, teamId: p.teamId ?? null, socketId: null }]));
      this.round = s.round ?? null;
      this.adjustments = s.adjustments ?? [];
      this.phase = s.phase;
      if (this.phase === 'getready' || this.phase === 'question') {
        // The interrupted question will be asked again.
        this.qIndex -= 1;
        this.round = null;
        this.phase = this.started ? 'leaderboard' : 'lobby';
      }
      this.restored = true;
      return true;
    } catch (err) {
      console.error('Snapshot hỏng, bỏ qua:', err);
      return false;
    }
  }
}
