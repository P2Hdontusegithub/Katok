// Endless horse-race track. Each lane is a player (or a whole team in team view);
// the camera pans and zooms so that every horse (from the last one to the
// leader) is always on screen. Team mates race in neighbouring lanes.
import type { HostState, PublicPlayer, PublicTeam } from '../../shared/types';
import { esc, fmtPoints, fmtTime } from '../common/dom';
import { horseSvg, playerColor } from '../common/horse';
import { sfx } from '../common/sound';

/** One horse on the track. */
export interface Lane {
  id: string;
  name: string;
  color: number;
  score: number;
  offline?: boolean;
  /** Lanes with the same group (team id) are drawn as a block, labelled with groupName. */
  group?: string | null;
  groupName?: string;
  /** Small second line under the name (team view: fastest member, correct count). */
  sub?: string;
}

/** Lanes for the "one horse per player" view, team mates next to each other. */
export function playerLanes(players: PublicPlayer[], teams: PublicTeam[]): Lane[] {
  const teamIdx = new Map(teams.map((t, i) => [t.id, i]));
  const group = (p: PublicPlayer) => (p.teamId ? teamIdx.get(p.teamId) ?? teams.length : teams.length);
  return players
    .map((p, i) => ({ p, i }))
    .sort((a, b) => group(a.p) - group(b.p) || a.i - b.i)
    .map(({ p }) => {
      const team = p.teamId ? teams.find((t) => t.id === p.teamId) : undefined;
      return { id: p.id, name: p.name, color: p.color, score: p.score, offline: !p.connected && !p.manual, group: team?.id ?? null, groupName: team?.name };
    });
}

/** Lanes for the team view: one horse per team that has members. */
export function teamLanes(s: HostState): Lane[] {
  const rows = new Map((s.round?.teamRows ?? []).map((r) => [r.teamId, r]));
  return s.teams
    .filter((t) => t.memberIds.length)
    .map((t) => {
      const r = rows.get(t.id);
      const parts = [`👥 ${t.memberIds.length}`];
      if (r) {
        parts.push(`✔ ${r.correct}/${r.members}`);
        if (r.fastest) parts.push(`⚡ ${esc(r.fastest.name)} ${fmtTime(r.fastest.timeMs)}`);
      }
      return { id: t.id, name: t.name, color: t.color, score: t.score, sub: parts.join(' · ') };
    });
}

interface Runner {
  id: string;
  row: HTMLElement;
  runner: HTMLElement;
  scoreEl: HTMLElement;
  rankEl: HTMLElement;
  nameEl: HTMLElement;
  teamEl: HTMLElement;
  subEl: HTMLElement;
  color: number;
  pos: number;
  from: number;
  to: number;
  delay: number;
}

const MIN_SPAN = 1500;
/** Team scores are averages and grow slower, so the camera may zoom in more. */
const MIN_SPAN_TEAMS = 600;
const RACE_MS = 3400;
/** Above this many player lanes, lanes are sorted by rank (leader on top) instead of grouped by team. */
export const SORT_LANES_ABOVE = 12;
const FLIP_MS = 700;

const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  const n = raw / p;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p;
}

export class RaceTrack {
  readonly el: HTMLElement;
  private inner: HTMLElement;
  private markersEl: HTMLElement;
  private runners = new Map<string, Runner>();
  private markers = new Map<number, HTMLElement>();
  private camMin = -200;
  private camMax = MIN_SPAN;
  private raf = 0;
  private t0 = 0;
  private lastT = 0;
  private trackW = 800;
  private laneH = 60;
  private ranks = new Map<string, number>();
  private mode: 'player' | 'team' = 'player';
  /** Lanes sorted by score (big games): re-sorted once the horses have finished running. */
  private pendingSort = false;
  private baseOrder = new Map<string, number>();
  /** Lanes currently scrolled into view: the camera only frames those horses. */
  private visible = new Set<string>();
  private io: IntersectionObserver;
  private leaderEl: HTMLElement;
  private looping = false;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'race';
    this.el.innerHTML = `<div class="race-scroll"><div class="race-inner"></div></div><div class="race-markers"></div><div class="race-leader" hidden></div>`;
    this.inner = this.el.querySelector('.race-inner')!;
    this.markersEl = this.el.querySelector('.race-markers')!;
    this.leaderEl = this.el.querySelector('.race-leader')!;
    new ResizeObserver(() => this.measure()).observe(this.el);
    this.io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.id!;
          if (e.isIntersecting) this.visible.add(id);
          else this.visible.delete(id);
        }
        this.kick();
      },
      { root: this.el.querySelector('.race-scroll'), threshold: 0.5 },
    );
  }

  /** Restart the animation loop (e.g. the camera must re-frame after scrolling). */
  private kick() {
    if (this.looping) return;
    this.looping = true;
    this.lastT = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }


  private measure() {
    // Lanes share the height via flexbox (with a minimum, then the track scrolls).
    const lane = this.inner.querySelector<HTMLElement>('.lane');
    this.laneH = lane?.clientHeight || 60;
    this.el.style.setProperty('--lane-h', `${this.laneH}px`);
    this.trackW = lane?.clientWidth || this.el.clientWidth * 0.78;
    this.render();
  }

  /**
   * Sync lanes (in display order). With animate=true horses gallop from where they are to their new score.
   * `mode` switches between player and team lanes; changing it rebuilds the track.
   */
  update(lanes: Lane[], mode: 'player' | 'team', animate: boolean, startFrom?: Map<string, number>, sorted = false) {
    if (mode !== this.mode) {
      this.mode = mode;
      for (const r of this.runners.values()) {
        this.io.unobserve(r.row);
        r.row.remove();
      }
      this.runners.clear();
      this.visible.clear();
      this.el.classList.toggle('teams', mode === 'team');
    }
    this.baseOrder = new Map(lanes.map((l, i) => [l.id, i]));
    const players = lanes;
    const seen = new Set<string>();
    for (const p of players) {
      seen.add(p.id);
      let r = this.runners.get(p.id);
      if (!r) {
        r = this.createRunner(p, animate ? startFrom?.get(p.id) ?? p.score : p.score);
        this.runners.set(p.id, r);
      }
      if (r.color !== p.color) {
        r.color = p.color;
        r.runner.querySelector('.horse')!.outerHTML = horseSvg(p.color);
        r.row.style.setProperty('--pc', playerColor(p.color));
      }
      r.nameEl.textContent = p.name;
      if (r.subEl.innerHTML !== (p.sub ?? '')) r.subEl.innerHTML = p.sub ?? '';
      r.row.classList.toggle('offline', !!p.offline);
      // Not animated: snap for real. Leaving `from` at the old position made the frame loop slide the
      // horse back over 3.4s, and a race opened mid-slide (e.g. "new game" then the first question
      // ended at once) started from a stale score and showed negative gains.
      if (!animate) r.from = r.pos = p.score;
      else r.from = r.pos;
      r.to = p.score;
      r.delay = animate ? Math.random() * 280 : 0;
    }
    for (const [id, r] of this.runners) {
      if (!seen.has(id)) {
        this.io.unobserve(r.row);
        r.row.remove();
        this.runners.delete(id);
        this.visible.delete(id);
      }
    }
    const list = [...players];
    this.ranks = new Map(list.map((p) => [p.id, 1 + list.filter((o) => o.score > p.score).length]));
    const moving = animate && [...this.runners.values()].some((r) => r.to !== r.from);
    if (!sorted) this.arrange(lanes);
    else {
      this.arrange(lanes.map((l) => ({ ...l, group: null })));
      // Keep the lanes still while horses run; re-sort when they have arrived.
      if (moving) this.pendingSort = true;
      else this.sortRows(false);
    }
    this.measure();

    if (moving) {
      for (const r of this.runners.values()) {
        const gained = Math.round(r.to - r.from);
        if (gained !== 0) this.popGain(r, gained);
      }
      sfx.gallop(RACE_MS / 1000);
    } else {
      this.applyRanks();
      this.snapCamera();
    }
    this.t0 = this.lastT = performance.now();
    cancelAnimationFrame(this.raf);
    this.looping = true;
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  /** Orders the rows by score (leader on top). With flip=true rows slide to their new place. */
  private sortRows(flip: boolean) {
    const order = [...this.runners.values()].sort(
      (a, b) => b.to - a.to || (this.baseOrder.get(a.id) ?? 0) - (this.baseOrder.get(b.id) ?? 0),
    );
    const rows = [...this.inner.querySelectorAll<HTMLElement>(':scope > .race-row')];
    if (!order.some((r, i) => rows[i] !== r.row)) return;
    const before = flip ? new Map(order.map((r) => [r.id, r.row.offsetTop])) : null;
    for (const r of order) this.inner.appendChild(r.row);
    if (!before) return;
    for (const r of order) {
      const dy = before.get(r.id)! - r.row.offsetTop;
      if (!dy) continue;
      r.row.style.transition = 'none';
      r.row.style.transform = `translateY(${dy}px)`;
    }
    void this.inner.offsetHeight;
    for (const r of order) {
      if (!r.row.style.transform) continue;
      r.row.style.transition = `transform ${FLIP_MS}ms cubic-bezier(0.3, 1.2, 0.4, 1)`;
      r.row.style.transform = '';
    }
    setTimeout(() => {
      for (const r of order) r.row.style.transition = '';
    }, FLIP_MS + 50);
  }

  /** Puts the rows in the given order and marks the start/end of each group block. */
  private arrange(order: Lane[]) {
    order.forEach((p, i) => {
      const r = this.runners.get(p.id)!;
      const first = !!p.group && order[i - 1]?.group !== p.group;
      r.row.classList.toggle('team-first', first);
      r.row.classList.toggle('team-last', !!p.group && order[i + 1]?.group !== p.group);
      r.teamEl.textContent = first ? p.groupName ?? '' : '';
    });
    const rows = [...this.inner.querySelectorAll<HTMLElement>(':scope > .race-row')];
    if (order.some((p, i) => rows[i] !== this.runners.get(p.id)!.row)) {
      for (const p of order) this.inner.appendChild(this.runners.get(p.id)!.row);
    }
  }

  private createRunner(p: Lane, pos: number): Runner {
    const row = document.createElement('div');
    row.className = 'race-row';
    row.dataset.id = p.id;
    this.io.observe(row);
    row.style.setProperty('--pc', playerColor(p.color));
    row.innerHTML = `
      <div class="rl"><span class="rl-team"></span><span class="rl-rank">–</span><span class="rl-text"><span class="rl-name">${esc(p.name)}</span><span class="rl-sub"></span></span><span class="rl-score">0</span></div>
      <div class="lane"><div class="runner">${horseSvg(p.color)}<span class="crown">👑</span></div></div>`;
    this.inner.appendChild(row);
    return {
      id: p.id,
      row,
      runner: row.querySelector('.runner')!,
      scoreEl: row.querySelector('.rl-score')!,
      rankEl: row.querySelector('.rl-rank')!,
      nameEl: row.querySelector('.rl-name')!,
      teamEl: row.querySelector('.rl-team')!,
      subEl: row.querySelector('.rl-sub')!,
      color: p.color,
      pos,
      from: pos,
      to: pos,
      delay: 0,
    };
  }

  private popGain(r: Runner, gained: number) {
    const el = document.createElement('span');
    el.className = `gain ${gained < 0 ? 'neg' : ''}`;
    el.textContent = `${gained > 0 ? '+' : ''}${fmtPoints(gained)}`;
    r.runner.appendChild(el);
    setTimeout(() => el.remove(), RACE_MS + 800);
  }

  private applyRanks() {
    let maxScore = -Infinity;
    for (const r of this.runners.values()) maxScore = Math.max(maxScore, r.to);
    for (const r of this.runners.values()) {
      const rank = this.ranks.get(r.id) ?? 0;
      r.rankEl.textContent = String(rank);
      r.row.dataset.rank = String(Math.min(rank, 4));
      r.row.classList.toggle('leader', rank === 1 && maxScore > 0);
    }
  }

  private target(): [number, number] {
    let lo = Infinity;
    let hi = -Infinity;
    // Include where horses are heading so the leader never runs off-screen.
    // When the lanes scroll, only the horses in view are framed (so the back of the field can be read too).
    const framed = [...this.runners.values()].filter((r) => this.visible.has(r.id));
    for (const r of framed.length ? framed : this.runners.values()) {
      lo = Math.min(lo, r.pos, r.to);
      hi = Math.max(hi, r.pos, r.to);
    }
    const minSpan = this.mode === 'team' ? MIN_SPAN_TEAMS : MIN_SPAN;
    if (!Number.isFinite(lo)) return [-minSpan * 0.13, minSpan];
    const spread = hi - lo;
    const extra = Math.max(0, minSpan - spread);
    return [lo - extra * 0.12 - spread * 0.02, hi + extra * 0.88 + spread * 0.08];
  }

  private snapCamera() {
    [this.camMin, this.camMax] = this.target();
  }

  private frame(t: number) {
    const dt = Math.min(64, t - this.lastT);
    this.lastT = t;
    let running = false;
    for (const r of this.runners.values()) {
      const k = Math.max(0, Math.min(1, (t - this.t0 - r.delay) / RACE_MS));
      r.pos = r.from + (r.to - r.from) * easeInOut(k);
      const moving = k > 0 && k < 1 && r.to !== r.from;
      r.runner.classList.toggle('running', moving);
      if (k < 1 && r.to !== r.from) running = true;
    }
    const [tMin, tMax] = this.target();
    const a = 1 - Math.exp(-dt / 220);
    this.camMin += (tMin - this.camMin) * a;
    this.camMax += (tMax - this.camMax) * a;
    this.render();
    const settled = Math.abs(tMin - this.camMin) + Math.abs(tMax - this.camMax) < (tMax - tMin) * 0.002;
    if (running || !settled) this.raf = requestAnimationFrame((tt) => this.frame(tt));
    else {
      this.looping = false;
      this.applyRanks();
      if (this.pendingSort && !running) {
        this.pendingSort = false;
        this.sortRows(true);
      }
    }
  }

  private render() {
    const horseW = Math.min(150, this.laneH * 1.45);
    this.el.style.setProperty('--horse-w', `${horseW}px`);
    const usable = Math.max(50, this.trackW - horseW - 12);
    const span = this.camMax - this.camMin || 1;
    const x = (pos: number) => horseW + ((pos - this.camMin) / span) * usable;
    let leader: Runner | null = null;
    for (const r of this.runners.values()) {
      r.runner.style.transform = `translate3d(${(x(r.pos) - horseW).toFixed(1)}px, 0, 0)`;
      r.scoreEl.textContent = fmtPoints(r.pos);
      if (!leader || r.pos > leader.pos) leader = r;
    }
    // The leader scrolled out of view: keep them visible as a badge.
    const showLeader = !!leader && this.visible.size > 0 && !this.visible.has(leader.id) && leader.pos > 0;
    this.leaderEl.hidden = !showLeader;
    if (showLeader) this.leaderEl.textContent = `👑 ${leader!.nameEl.textContent} · ${fmtPoints(leader!.pos)}`;
    // Ground texture scrolls with the camera for a sense of speed.
    const pxPerPt = usable / span;
    this.el.style.setProperty('--ground-x', `${(-this.camMin * pxPerPt) % 120}px`);
    this.renderMarkers(x, span);
  }

  private renderMarkers(x: (p: number) => number, span: number) {
    const step = niceStep(span / 6);
    const first = Math.ceil(this.camMin / step);
    const last = Math.floor(this.camMax / step);
    const keep = new Set<number>();
    for (let k = first; k <= last; k++) {
      const v = k * step;
      keep.add(v);
      let m = this.markers.get(v);
      if (!m) {
        m = document.createElement('div');
        m.className = v === 0 ? 'marker start' : 'marker';
        m.innerHTML = `<span>${v === 0 ? 'XUẤT PHÁT' : fmtPoints(v)}</span>`;
        this.markersEl.appendChild(m);
        this.markers.set(v, m);
      }
      m.style.transform = `translateX(${x(v).toFixed(1)}px)`;
    }
    for (const [v, m] of this.markers) {
      if (!keep.has(v)) {
        m.remove();
        this.markers.delete(v);
      }
    }
  }
}

/** Lanes for the current view (team or player) of a host state. */
export function lanesFor(s: HostState): { lanes: Lane[]; mode: 'player' | 'team'; sorted: boolean } {
  if (s.teamView) return { lanes: teamLanes(s), mode: 'team', sorted: false };
  const lanes = playerLanes(s.players, s.teams);
  if (lanes.length <= SORT_LANES_ABOVE) return { lanes, mode: 'player', sorted: false };
  // Many players: sorted by rank, so team blocks are replaced by the team name under each player.
  return { lanes: lanes.map((l) => ({ ...l, group: null, sub: l.groupName ? esc(l.groupName) : undefined })), mode: 'player', sorted: true };
}
