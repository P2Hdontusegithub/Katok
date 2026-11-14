import type { AwardEntry, DisplayMode, HostAction, HostState, PublicPlayer, PublicTeam, RoundRow, TeamRow } from '../../shared/types';
import { ANSWER_LETTERS, AWARD_TITLES, PLAYER_COLORS } from '../../shared/types';
import { countTo, esc, fmtPoints, fmtTime } from '../common/dom';
import { horseSvg, playerColor } from '../common/horse';
import { ANSWER_COLORS, ANSWER_NAMES, shapeSvg } from '../common/shapes';
import { sfx } from '../common/sound';
import { bindJoinCard, JOIN_CARD_HTML } from './join';
import { lanesFor, type RaceTrack } from './race';

export interface Ctx {
  send(action: HostAction): Promise<boolean>;
  track: RaceTrack;
}

export interface View {
  update(s: HostState): void;
  destroy?(): void;
}

const qLabel = (s: HostState) => (s.question ? `Câu ${s.question.index + 1} / ${s.question.total}` : '');

// ───────────────────────── Lobby ─────────────────────────

export function lobbyView(stage: HTMLElement, s: HostState, ctx: Ctx): View {
  stage.innerHTML = `
    <div class="lobby">
      <aside class="join-card pop-in">${JOIN_CARD_HTML}</aside>
      <section class="lobby-main">
        <div class="lobby-logo"><h1 class="logo big">Ka<span>-</span>tok</h1><span class="logo-horse">${horseSvg(3, 'running')}</span></div>
        <div class="set-picker">
          <label>Bộ câu hỏi</label>
          <select class="set-select"></select>
          <button class="btn small ghost reload" title="Đọc lại các file JSON trong thư mục questions/">⟳ Tải lại</button>
          <span class="mode-pick"><label>Hiển thị</label>
          <select class="mode-select" title="Đường đua & bảng điểm: mỗi đội một ngựa, hay mỗi người một ngựa">
            <option value="auto">Tự động</option>
            <option value="team">🏇 Theo đội</option>
            <option value="player">🐴 Từng người</option>
          </select></span>
        </div>
        <div class="set-errors"></div>
        <form class="team-form" autocomplete="off">
          <label>Đội</label>
          <input name="name" maxlength="12" placeholder="Tên đội (ngắn)" />
          <div class="swatches"></div>
          <button class="btn small">＋ Tạo đội</button>
        </form>
        <div class="lobby-count"><b>0</b> người chơi đã vào<span class="team-count"></span></div>
        <div class="lobby-players">
          <div class="teams"></div>
          <div class="solo-label" hidden>Chưa chọn đội</div>
          <div class="bubbles"></div>
          <div class="lobby-empty">Đang chờ người chơi… 🐴</div>
        </div>
      </section>
    </div>`;
  const updateJoin = bindJoinCard(stage.querySelector<HTMLElement>('.join-card')!, ctx);
  const setSel = stage.querySelector<HTMLSelectElement>('.set-select')!;
  const modeSel = stage.querySelector<HTMLSelectElement>('.mode-select')!;
  modeSel.onchange = () => ctx.send({ type: 'setDisplayMode', mode: modeSel.value as DisplayMode });
  const errors = stage.querySelector<HTMLElement>('.set-errors')!;
  const countEl = stage.querySelector<HTMLElement>('.lobby-count b')!;
  const teamCountEl = stage.querySelector<HTMLElement>('.team-count')!;
  const teamForm = stage.querySelector<HTMLFormElement>('.team-form')!;
  const swatches = stage.querySelector<HTMLElement>('.swatches')!;
  const teamsEl = stage.querySelector<HTMLElement>('.teams')!;
  const soloLabel = stage.querySelector<HTMLElement>('.solo-label')!;
  const bubbles = stage.querySelector<HTMLElement>('.bubbles')!;
  const empty = stage.querySelector<HTMLElement>('.lobby-empty')!;
  const known = new Map<string, HTMLElement>();
  const seen = new Set<string>();
  let first = true;
  let current = s;
  let pickColor = -1;
  let teamsSig = '';

  const freeColors = (exceptTeam?: string) => {
    const taken = new Set(current.teams.filter((t) => t.id !== exceptTeam).map((t) => t.color));
    return PLAYER_COLORS.map((_, i) => i).filter((i) => !taken.has(i));
  };

  teamForm.onsubmit = async (e) => {
    e.preventDefault();
    const input = teamForm.elements.namedItem('name') as HTMLInputElement;
    if (await ctx.send({ type: 'createTeam', name: input.value, color: pickColor })) {
      input.value = '';
      pickColor = -1;
    }
  };
  swatches.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.sw');
    if (!b || b.disabled) return;
    pickColor = Number(b.dataset.c);
    renderSwatches();
  };
  const renderSwatches = () => {
    const free = freeColors();
    if (!free.includes(pickColor)) pickColor = free[0] ?? -1;
    swatches.innerHTML = PLAYER_COLORS.map(
      (c, i) => `<button type="button" class="sw ${i === pickColor ? 'on' : ''}" data-c="${i}" style="--pc:${c}" ${free.includes(i) ? '' : 'disabled'} title="Chọn màu đội"></button>`,
    ).join('');
  };
  teamsEl.onclick = (e) => {
    const el = e.target as HTMLElement;
    const card = el.closest<HTMLElement>('.team-card');
    const team = current.teams.find((t) => t.id === card?.dataset.id);
    if (!team) return;
    if (el.closest('.tc-del')) {
      if (confirm(`Xoá đội "${team.name}"? Thành viên sẽ chơi cá nhân.`)) ctx.send({ type: 'deleteTeam', teamId: team.id });
    } else if (el.closest('.tc-color')) {
      // Cycle to the next colour no other team uses.
      const free = freeColors(team.id);
      const next = free.find((c) => c > team.color) ?? free[0];
      if (next !== undefined && next !== team.color) ctx.send({ type: 'updateTeam', teamId: team.id, color: next });
    } else if (el.closest('.tc-name')) {
      const n = prompt('Tên đội mới:', team.name);
      if (n) ctx.send({ type: 'updateTeam', teamId: team.id, name: n });
    } else {
      const m = el.closest<HTMLElement>('.member');
      if (m && confirm(`Mời "${m.dataset.name}" ra khỏi phòng?`)) ctx.send({ type: 'kick', playerId: m.dataset.id! });
    }
  };

  const renderTeams = (s: HostState) => {
    const byId = new Map(s.players.map((p) => [p.id, p]));
    const max = s.maxTeamSize;
    const sig = JSON.stringify([max, s.teams.map((t) => [t.id, t.name, t.color, t.memberIds]), s.players.map((p) => [p.id, p.name, p.connected])]);
    if (sig === teamsSig) return;
    teamsSig = sig;
    renderSwatches();
    teamsEl.innerHTML = s.teams
      .map((t) => {
        const members = t.memberIds.map((id) => byId.get(id)!).filter(Boolean);
        // Empty slots are only drawn for small teams; big teams just list who is in.
        const slots = Array.from({ length: max <= 6 ? max : members.length }, (_, i) => {
          const p = members[i];
          return p
            ? `<li class="member ${!p.connected && !p.manual ? 'offline' : ''}" data-id="${p.id}" data-name="${esc(p.name)}" title="${!p.connected && !p.manual ? 'Mất kết nối' : ''}">${horseSvg(t.color)}<span>${esc(p.name)}</span></li>`
            : `<li class="slot">trống</li>`;
        });
        if (!slots.length) slots.push('<li class="slot">chưa có ai</li>');
        return `<div class="team-card ${members.length >= max ? 'full' : ''} ${max > 6 ? 'big' : ''}" data-id="${t.id}" style="--pc:${playerColor(t.color)}">
          <header>
            <button class="tc-color" title="Đổi màu đội"></button>
            <b class="tc-name" title="Bấm để đổi tên">${esc(t.name)}</b>
            <span class="tc-count">${members.length}/${max}</span>
            <button class="tc-del" title="Xoá đội">✕</button>
          </header>
          <ul>${slots.join('')}</ul>
        </div>`;
      })
      .join('');
  };

  setSel.onchange = () => ctx.send({ type: 'selectSet', setId: setSel.value });
  stage.querySelector<HTMLElement>('.reload')!.onclick = () => ctx.send({ type: 'reloadQuestions' });
  bubbles.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.bubble');
    if (b && confirm(`Mời "${b.dataset.name}" ra khỏi phòng?`)) ctx.send({ type: 'kick', playerId: b.dataset.id! });
  };

  const update = (s: HostState) => {
    current = s;
    updateJoin(s);
    if (document.activeElement !== modeSel) modeSel.value = s.displayMode;
    modeSel.options[0].text = `Tự động (${s.teamView ? 'theo đội' : 'từng người'})`;
    setSel.innerHTML = s.questionSets
      .map((q) => `<option value="${esc(q.id)}" ${q.id === s.setId ? 'selected' : ''} ${q.count ? '' : 'disabled'}>${esc(q.title)} (${q.count} câu)</option>`)
      .join('') || '<option>— Chưa có file câu hỏi —</option>';
    const errs = s.questionSets.flatMap((q) => q.errors.map((e) => `<li><b>${esc(q.id)}.json</b>: ${esc(e)}</li>`));
    errors.innerHTML = errs.length ? `<ul>${errs.slice(0, 6).join('')}${errs.length > 6 ? `<li>… và ${errs.length - 6} lỗi khác</li>` : ''}</ul>` : '';

    countEl.textContent = String(s.players.length);
    teamCountEl.textContent = s.teams.length ? ` · ${s.teams.length} đội` : '';
    empty.hidden = s.players.length > 0;
    renderTeams(s);
    for (const p of s.players) {
      if (!seen.has(p.id) && !first) sfx.pop();
      seen.add(p.id);
    }
    // Bubbles only for players without a team; team members are shown in their team card.
    const solo = s.players.filter((p) => !p.teamId);
    soloLabel.hidden = !s.teams.length || !solo.length;
    const ids = new Set(solo.map((p) => p.id));
    for (const [id, el] of known) {
      if (!ids.has(id)) {
        el.classList.add('leaving');
        setTimeout(() => el.remove(), 300);
        known.delete(id);
      }
    }
    for (const p of solo) {
      let el = known.get(p.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'bubble';
        el.dataset.id = p.id;
        bubbles.appendChild(el);
        known.set(p.id, el);
      }
      if (el.dataset.sig !== `${p.name}|${p.color}`) {
        el.dataset.sig = `${p.name}|${p.color}`;
        el.dataset.name = p.name;
        el.style.setProperty('--pc', playerColor(p.color));
        el.innerHTML = `${horseSvg(p.color)}<span>${esc(p.name)}</span>`;
      }
      const offline = !p.connected && !p.manual;
      el.classList.toggle('offline', offline);
      el.title = offline ? 'Mất kết nối' : '';
    }
    first = false;
  };
  update(s);
  return { update };
}

// ───────────────────────── Get ready ─────────────────────────

export function getReadyView(stage: HTMLElement, s: HostState): View {
  const q = s.question!;
  const secs = (s.remainingMs ?? 0) / 1000;
  stage.innerHTML = `
    <div class="getready">
      <div class="q-counter pop-in">${qLabel(s)}</div>
      ${q.points !== 1 ? `<div class="multiplier pop-in">${q.points === 0 ? 'Câu khởi động – không tính điểm' : `×${q.points} ĐIỂM!`}</div>` : ''}
      <h1 class="q-text huge slide-up">${esc(q.text)}</h1>
      <div class="ready-bar"><i style="animation-duration:${secs}s"></i></div>
    </div>`;
  return { update() {} };
}

// ───────────────────────── Question + reveal ─────────────────────────

export function questionView(stage: HTMLElement, s: HostState): View {
  const q = s.question!;
  const n = q.answers.length;
  stage.innerHTML = `
    <div class="qview">
      <header class="q-head">
        <div class="q-counter">${qLabel(s)}${q.points !== 1 ? ` · <b>×${q.points}</b>` : ''}</div>
        <h1 class="q-text">${esc(q.text)}</h1>
      </header>
      <div class="q-mid">
        <div class="timer">
          <svg viewBox="0 0 100 100"><circle class="t-bg" cx="50" cy="50" r="44"/><circle class="t-fg" cx="50" cy="50" r="44"/></svg>
          <span class="t-num">${q.time}</span>
        </div>
        <div class="q-media">
          ${q.image ? `<img src="/media/${encodeURI(q.image)}" alt="" />` : `<div class="media-horse">${horseSvg(q.index % 16, 'running')}</div>`}
        </div>
        <div class="answered"><b>0</b><span>đã trả lời</span></div>
      </div>
      <div class="feed"></div>
      <div class="answers n${n}">
        ${q.answers
          .map(
            (a, i) => `
          <div class="tile ${ANSWER_NAMES[i]}" style="--ac:${ANSWER_COLORS[i]}">
            ${shapeSvg(i)}<span class="tile-letter">${ANSWER_LETTERS[i]}</span><span class="tile-text">${esc(a)}</span>
            <span class="tile-mark"></span>
          </div>`,
          )
          .join('')}
      </div>
    </div>`;

  const numEl = stage.querySelector<HTMLElement>('.t-num')!;
  const ring = stage.querySelector<SVGCircleElement>('.t-fg')!;
  const timerEl = stage.querySelector<HTMLElement>('.timer')!;
  const answeredEl = stage.querySelector<HTMLElement>('.answered b')!;
  const feedEl = stage.querySelector<HTMLElement>('.feed')!;
  const media = stage.querySelector<HTMLElement>('.q-media')!;
  const tiles = [...stage.querySelectorAll<HTMLElement>('.tile')];
  const circ = 2 * Math.PI * 44;
  ring.style.strokeDasharray = `${circ}`;

  let endsAt = 0;
  let raf = 0;
  let lastSec = -1;
  let revealed = false;
  const shownFeed = new Set<string>();

  const tick = () => {
    const left = Math.max(0, endsAt - performance.now());
    const sec = Math.ceil(left / 1000);
    numEl.textContent = String(sec);
    ring.style.strokeDashoffset = `${circ * (1 - left / (q.time * 1000))}`;
    if (sec !== lastSec) {
      if (lastSec !== -1 && sec <= 5 && sec > 0) sfx.tick(sec <= 3);
      lastSec = sec;
      timerEl.classList.toggle('urgent', sec <= 5);
    }
    if (left > 0) raf = requestAnimationFrame(tick);
  };

  const reveal = (s: HostState) => {
    revealed = true;
    cancelAnimationFrame(raf);
    stage.querySelector('.qview')!.classList.add('revealed');
    timerEl.classList.remove('urgent');
    timerEl.classList.add('done');
    numEl.textContent = '⏰';
    ring.style.strokeDashoffset = `${circ}`;
    const correct = s.correct ?? [];
    tiles.forEach((t, i) => {
      t.classList.add(correct.includes(i) ? 'right' : 'wrong');
      t.querySelector('.tile-mark')!.textContent = correct.includes(i) ? '✔' : '✘';
    });
    const counts = s.round?.counts ?? q.answers.map(() => 0);
    const max = Math.max(1, ...counts);
    const fastest = (s.round?.rows ?? []).filter((r) => r.correct && r.timeMs !== null).sort((a, b) => a.timeMs! - b.timeMs!).slice(0, 3);
    media.innerHTML = `
      <div class="chart">
        ${counts
          .map(
            (c, i) => `
          <div class="bar ${correct.includes(i) ? 'right' : ''}" style="--ac:${ANSWER_COLORS[i]}">
            <span class="bar-n">${c}</span>
            <i style="--h:${(c / max) * 100}%"></i>
            <span class="bar-icon">${shapeSvg(i)}${correct.includes(i) ? '<em>✔</em>' : ''}</span>
          </div>`,
          )
          .join('')}
      </div>
      ${
        fastest.length
          ? `<div class="fastest"><div class="fastest-title">⚡ Nhanh nhất</div>${fastest
              .map((r, i) => `<div class="fast-row" style="--pc:${playerColor(r.color)};animation-delay:${0.4 + i * 0.2}s"><b>${i + 1}</b><span>${esc(r.name)}</span><em>${fmtTime(r.timeMs)}</em></div>`)
              .join('')}</div>`
          : `<div class="fastest none">Không ai trả lời đúng 😅</div>`
      }`;
  };

  const update = (s: HostState) => {
    if (s.phase === 'question' && s.remainingMs !== null) {
      endsAt = performance.now() + s.remainingMs;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    }
    countTo(answeredEl, s.answeredCount, 300);
    for (const f of [...s.feed].reverse()) {
      if (shownFeed.has(f.playerId)) continue;
      shownFeed.add(f.playerId);
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.style.setProperty('--pc', playerColor(f.color));
      chip.innerHTML = `<b>${esc(f.name)}</b> ${fmtTime(f.timeMs)}`;
      feedEl.prepend(chip);
      while (feedEl.children.length > 30) feedEl.lastElementChild!.remove();
    }
    if (s.phase === 'reveal' && !revealed) reveal(s);
  };
  update(s);
  return { update, destroy: () => cancelAnimationFrame(raf) };
}

// ───────────────────────── Race ─────────────────────────

export function raceView(stage: HTMLElement, s: HostState, ctx: Ctx): View {
  stage.innerHTML = `
    <div class="raceview">
      <div class="race-title"><span>🏇 Đường đua</span><small></small></div>
      <div class="race-holder"></div>
    </div>`;
  const small = stage.querySelector<HTMLElement>('.race-title small')!;
  stage.querySelector('.race-holder')!.appendChild(ctx.track.el);
  const update = (s: HostState) => {
    small.textContent = s.question ? `sau câu ${s.question.index + 1} / ${s.question.total}` : s.setTitle;
    const { lanes, mode, sorted } = lanesFor(s);
    const startFrom =
      mode === 'team'
        ? new Map((s.round?.teamRows ?? []).map((r) => [r.teamId, r.score - r.gained]))
        : new Map((s.round?.rows ?? []).map((r) => [r.playerId, r.score - r.gained]));
    ctx.track.update(lanes, mode, true, startFrom, sorted);
  };
  update(s);
  return { update };
}

// ───────────────────────── Leaderboard ─────────────────────────

function rankDelta(r: { prevRank: number; rank: number }) {
  const d = r.prevRank - r.rank;
  if (!r.prevRank || d === 0) return '<span class="delta same">•</span>';
  return d > 0 ? `<span class="delta up">▲${d}</span>` : `<span class="delta down">▼${-d}</span>`;
}

type SortKey = 'rank' | 'name' | 'ans' | 'time' | 'gain' | 'total';

const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'rank', label: 'Thứ tự' },
  { key: 'name', label: 'Người chơi' },
  { key: 'ans', label: 'Đáp án' },
  { key: 'time', label: 'Thời gian' },
  { key: 'gain', label: 'Điểm lượt này' },
  { key: 'total', label: 'Tổng điểm' },
];

/** Sort order of the player rows; "time" = correct answers by speed, then wrong ones, then no answer. */
function sortRows(rows: RoundRow[], key: SortKey, asc: boolean): RoundRow[] {
  const group = (r: RoundRow) => (r.correct ? 0 : r.choice !== null ? 1 : 2);
  const cmp: Record<SortKey, (a: RoundRow, b: RoundRow) => number> = {
    rank: (a, b) => a.rank - b.rank,
    name: (a, b) => a.name.localeCompare(b.name, 'vi'),
    ans: (a, b) => group(a) - group(b) || (a.choice ?? 9) - (b.choice ?? 9),
    time: (a, b) => group(a) - group(b) || (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity),
    gain: (a, b) => b.gained - a.gained,
    total: (a, b) => b.score - a.score,
  };
  const dir = asc ? 1 : -1;
  return [...rows].sort((a, b) => dir * cmp[key](a, b) || a.rank - b.rank || a.name.localeCompare(b.name, 'vi'));
}

export function boardView(stage: HTMLElement, s: HostState): View {
  stage.innerHTML = `
    <div class="board">
      <h1 class="board-title slide-up">📋 Bảng kết quả <small></small></h1>
      <div class="table-wrap"><table class="results"><thead></thead><tbody></tbody></table></div>
    </div>`;
  const small = stage.querySelector<HTMLElement>('.board-title small')!;
  const thead = stage.querySelector<HTMLElement>('thead')!;
  const tbody = stage.querySelector<HTMLElement>('tbody')!;
  let animated = false;
  // Default: who answered correctly the fastest on the question just played.
  let sortKey: SortKey = 'time';
  let asc = true;
  let current = s;
  thead.onclick = (e) => {
    const k = (e.target as HTMLElement).closest<HTMLElement>('th[data-k]')?.dataset.k as SortKey | undefined;
    if (!k) return;
    if (k === sortKey) asc = !asc;
    else {
      sortKey = k;
      asc = true;
    }
    update(current);
  };

  const update = (s: HostState) => {
    current = s;
    small.textContent = s.question ? `· sau câu ${s.question.index + 1} / ${s.question.total}` : '';
    stage.querySelector('.board')!.classList.toggle('team-board', s.teamView);
    const round = s.round;
    if (s.teamView) {
      renderTeamBoard(s, thead, tbody, animated);
    } else if (round) {
      thead.innerHTML = `<tr>${SORT_COLUMNS.map(
        (c) => `<th data-k="${c.key}" class="sortable ${c.key === sortKey ? 'sorted' : ''}" title="Bấm để sắp xếp">${c.label}${
          c.key === sortKey ? `<i class="sort-dir">${asc ? '▼' : '▲'}</i>` : ''
        }</th>`,
      ).join('')}</tr>`;
      tbody.innerHTML = sortRows(round.rows, sortKey, asc)
        .map(
          (r, i) => `
        <tr class="${animated ? '' : 'row-in'} ${r.rank <= 3 ? `top top${r.rank}` : ''}" style="--pc:${playerColor(r.color)};animation-delay:${Math.min(i, 20) * 0.06}s">
          <td class="c-rank"><span class="rank-badge">${r.rank}</span>${rankDelta(r)}</td>
          <td class="c-name"><i class="dot"></i>${esc(r.name)}${r.fastest ? ' <span class="bolt" title="Nhanh nhất">⚡</span>' : ''}</td>
          <td class="c-ans">${
            r.choice === null
              ? '<span class="muted">—</span>'
              : `<span class="ans-pill ${r.correct ? 'ok' : 'bad'}" style="--ac:${ANSWER_COLORS[r.choice]}">${shapeSvg(r.choice)}${ANSWER_LETTERS[r.choice]} ${r.correct ? '✔' : '✘'}</span>`
          }</td>
          <td class="c-time">${fmtTime(r.timeMs)}</td>
          <td class="c-gain ${r.gained > 0 ? 'pos' : ''}">${r.gained > 0 ? '+' : ''}${fmtPoints(r.gained)}</td>
          <td class="c-total">${fmtPoints(r.score)}</td>
        </tr>`,
        )
        .join('');
    } else {
      thead.innerHTML = `<tr><th>Thứ tự</th><th>Người chơi</th><th>Tổng điểm</th></tr>`;
      const sorted = [...s.players].sort((a, b) => b.score - a.score);
      tbody.innerHTML = sorted
        .map((p, i) => {
          const rank = 1 + sorted.filter((o) => o.score > p.score).length;
          return `<tr class="${animated ? '' : 'row-in'} ${rank <= 3 ? `top top${rank}` : ''}" style="--pc:${playerColor(p.color)};animation-delay:${Math.min(i, 20) * 0.06}s">
            <td class="c-rank"><span class="rank-badge">${rank}</span></td>
            <td class="c-name"><i class="dot"></i>${esc(p.name)}</td>
            <td class="c-total">${fmtPoints(p.score)}</td></tr>`;
        })
        .join('');
    }
    animated = true;
  };
  update(s);
  return { update };
}

/** Team view of the leaderboard: one big row per team, plus the top 10 players on the side. */
function renderTeamBoard(s: HostState, thead: HTMLElement, tbody: HTMLElement, animated: boolean) {
  const board = thead.closest('.board')!;
  let side = board.querySelector<HTMLElement>('.top-players');
  if (!side) {
    side = document.createElement('aside');
    side.className = 'top-players';
    board.querySelector('.table-wrap')!.after(side);
  }
  const rows: TeamRow[] =
    s.round?.teamRows ??
    s.teams
      .filter((t) => t.memberIds.length)
      .sort((a, b) => b.score - a.score)
      .map((t, _, all) => ({
        teamId: t.id, name: t.name, color: t.color, rank: 1 + all.filter((o) => o.score > t.score).length, prevRank: 0,
        members: t.memberIds.length, answered: 0, correct: 0, avgTimeMs: null, gained: 0, score: t.score, fastest: null,
      }));
  const hasRound = !!s.round?.teamRows;
  thead.innerHTML = hasRound
    ? `<tr><th>Hạng</th><th>Đội</th><th>Đúng</th><th>TG trung bình</th><th>⚡ Nhanh nhất đội</th><th>+ Điểm</th><th>Điểm đội</th></tr>`
    : `<tr><th>Hạng</th><th>Đội</th><th>Thành viên</th><th>Điểm đội</th></tr>`;
  tbody.innerHTML = rows
    .map(
      (r, i) => `
    <tr class="${animated ? '' : 'row-in'} ${r.rank <= 3 ? `top top${r.rank}` : ''}" style="--pc:${playerColor(r.color)};animation-delay:${i * 0.08}s">
      <td class="c-rank"><span class="rank-badge">${r.rank}</span>${hasRound ? rankDelta(r) : ''}</td>
      <td class="c-name"><i class="dot"></i>${esc(r.name)}</td>
      ${
        hasRound
          ? `<td class="c-ok">${r.correct}<small>/${r.members}</small></td>
      <td class="c-time">${fmtTime(r.avgTimeMs)}</td>
      <td class="c-fast">${r.fastest ? `${esc(r.fastest.name)} <small>${fmtTime(r.fastest.timeMs)}</small>` : '<span class="muted">—</span>'}</td>
      <td class="c-gain ${r.gained > 0 ? 'pos' : ''}">${r.gained > 0 ? '+' : ''}${fmtPoints(r.gained)}</td>`
          : `<td class="c-ok">${r.members}</td>`
      }
      <td class="c-total">${fmtPoints(r.score)}</td>
    </tr>`,
    )
    .join('');
  const top = [...s.players].sort((a, b) => b.score - a.score).slice(0, 10);
  const teamName = new Map(s.teams.map((t) => [t.id, t.name]));
  side.innerHTML = `<h2>🐴 Top 10 cá nhân</h2><ol>${top
    .map(
      (p) => `<li style="--pc:${playerColor(p.color)}"><b>${1 + s.players.filter((o) => o.score > p.score).length}</b><span>${esc(p.name)}${
        p.teamId ? ` <small>${esc(teamName.get(p.teamId) ?? '')}</small>` : ''
      }</span><em>${fmtPoints(p.score)}</em></li>`,
    )
    .join('')}</ol>`;
}

// ───────────────────────── Final ─────────────────────────

const MEDALS = ['🥇', '🥈', '🥉'];

/** Team podium (shown before the individual one): one horse per team, members listed by contribution. */
export function teamFinalView(stage: HTMLElement, s: HostState, ctx: Ctx): View {
  stage.innerHTML = `
    <div class="final team-final">
      <h1 class="final-title slide-up">🏆 Đồng đội 🏆</h1>
      <div class="podium"></div>
      <ol class="rest"></ol>
    </div>`;
  if (isLastEnd(s)) stage.querySelector('.final')!.append(finalActions(ctx));
  const podium = stage.querySelector<HTMLElement>('.podium')!;
  const rest = stage.querySelector<HTMLElement>('.rest')!;
  const update = (s: HostState) => {
    const byId = new Map(s.players.map((p) => [p.id, p]));
    // Highest scorer first: the members who contributed most are the ones that fit on screen.
    const names = (t: PublicTeam) =>
      t.memberIds
        .map((id) => byId.get(id))
        .filter((p): p is PublicPlayer => !!p)
        .sort((a, b) => b.score - a.score)
        .map((p) => esc(p.name))
        .join(' · ');
    const sorted = s.teams.filter((t) => t.memberIds.length).sort((a, b) => b.score - a.score);
    const rankOf = (t: PublicTeam) => 1 + sorted.filter((o) => o.score > t.score).length;
    const spot = (t: PublicTeam | undefined, place: number) =>
      t
        ? `<div class="spot p${place}" style="--pc:${playerColor(t.color)}">
            <div class="spot-horse">${horseSvg(t.color, place === 1 ? 'running' : '')}</div>
            <div class="spot-name">${esc(t.name)}</div>
            <div class="spot-members">${names(t)}</div>
            <div class="spot-score">${fmtPoints(t.score)}</div>
            <div class="spot-block"><span>${MEDALS[place - 1]}</span></div>
          </div>`
        : `<div class="spot p${place} empty"><div class="spot-block"></div></div>`;
    podium.innerHTML = spot(sorted[1], 2) + spot(sorted[0], 1) + spot(sorted[2], 3);
    rest.innerHTML = sorted
      .slice(3, 15)
      .map((t) => `<li style="--pc:${playerColor(t.color)}"><b>${rankOf(t)}</b><i class="dot"></i><span>${esc(t.name)} <small>${names(t)}</small></span><em>${fmtPoints(t.score)}</em></li>`)
      .join('');
  };
  update(s);
  return { update };
}

export function finalView(stage: HTMLElement, s: HostState, ctx: Ctx): View {
  stage.innerHTML = `
    <div class="final">
      <h1 class="final-title slide-up">🏆 Chung cuộc 🏆</h1>
      <div class="podium"></div>
      <ol class="rest"></ol>
    </div>`;
  if (isLastEnd(s)) stage.querySelector('.final')!.append(finalActions(ctx));
  const podium = stage.querySelector<HTMLElement>('.podium')!;
  const rest = stage.querySelector<HTMLElement>('.rest')!;
  const update = (s: HostState) => {
    const sorted = [...s.players].sort((a, b) => b.score - a.score);
    const rankOf = (p: PublicPlayer) => 1 + sorted.filter((o) => o.score > p.score).length;
    const spot = (p: PublicPlayer | undefined, place: number) =>
      p
        ? `<div class="spot p${place}" style="--pc:${playerColor(p.color)}">
            <div class="spot-horse">${horseSvg(p.color, place === 1 ? 'running' : '')}</div>
            <div class="spot-name">${esc(p.name)}</div>
            <div class="spot-score">${fmtPoints(p.score)}</div>
            <div class="spot-block"><span>${MEDALS[place - 1]}</span></div>
          </div>`
        : `<div class="spot p${place} empty"><div class="spot-block"></div></div>`;
    podium.innerHTML = spot(sorted[1], 2) + spot(sorted[0], 1) + spot(sorted[2], 3);
    rest.innerHTML = sorted
      .slice(3, 15)
      .map((p) => `<li style="--pc:${playerColor(p.color)}"><b>${rankOf(p)}</b><i class="dot"></i><span>${esc(p.name)}</span><em>${fmtPoints(p.score)}</em></li>`)
      .join('');
  };
  update(s);
  return { update };
}

// ───────────────────────── Awards ─────────────────────────

/** One special award per screen, revealed from the last place up to the winner. */
export function awardsView(stage: HTMLElement, s: HostState): View {
  const step = s.endSteps[s.endIndex];
  const award = step?.phase === 'awards' ? s.awards[step.award] : undefined;
  if (!award) {
    stage.innerHTML = '<div class="final"><h1 class="final-title">🏆</h1></div>';
    return { update() {} };
  }
  const t = AWARD_TITLES[award.kind];
  const n = award.entries.length;
  const sub: Record<typeof award.kind, string> = {
    fastest: 'Những lần bấm đúng nhanh nhất cả trận',
    mostCorrect: `Nhiều câu đúng nhất trong ${award.questionCount} câu tính điểm`,
    teamBest: 'Thành viên ghi điểm cao nhất của từng đội',
  };
  const team = (e: AwardEntry) =>
    e.teamName ? `<span class="aw-team" style="--tc:${playerColor(e.teamColor ?? e.color)}">${esc(e.teamName)}</span>` : '';
  // Reveal bottom-up: the winner (index 0) appears last.
  const delay = (i: number) => `animation-delay:${0.6 + (n - 1 - i) * 0.7}s`;

  const body =
    award.kind === 'teamBest'
      ? `<div class="aw-grid">${award.entries
          .map(
            (e, i) => `
          <div class="aw-card" style="--pc:${playerColor(e.color)};${delay(i)}">
            <div class="aw-card-team">${esc(e.teamName ?? '')}</div>
            <div class="aw-horse">${horseSvg(e.color, 'running')}</div>
            <div class="aw-name">${esc(e.name)}</div>
            <div class="aw-value">${fmtPoints(e.score ?? 0)} <small>điểm</small></div>
            <div class="aw-detail">${e.correct ?? 0} câu đúng</div>
          </div>`,
          )
          .join('')}</div>`
      : `<ol class="aw-list">${award.entries
          .map((e, i) => {
            const value = award.kind === 'fastest' ? fmtTime(e.timeMs ?? null) : `${e.correct ?? 0}<small>/${award.questionCount} câu</small>`;
            const detail = award.kind === 'fastest' ? `Câu ${(e.questionIndex ?? 0) + 1}` : `TB ${fmtTime(e.timeMs ?? null)}`;
            return `
          <li class="aw-row ${i === 0 ? 'first' : ''}" style="--pc:${playerColor(e.color)};${delay(i)}">
            <b class="aw-rank">${MEDALS[i] ?? i + 1}</b>
            <span class="aw-horse">${horseSvg(e.color, i === 0 ? 'running' : '')}</span>
            <span class="aw-who"><span class="aw-name">${esc(e.name)}</span>${team(e)}</span>
            <span class="aw-detail">${detail}</span>
            <span class="aw-value">${value}</span>
          </li>`;
          })
          .join('')}</ol>`;

  stage.innerHTML = `
    <div class="final awards aw-${award.kind}">
      <h1 class="final-title slide-up">${t.icon} ${t.title}</h1>
      <p class="aw-sub slide-up">${sub[award.kind]}</p>
      ${body}
    </div>`;
  return { update() {} };
}

/** Buttons shown on the last end screen. */
function finalActions(ctx: Ctx): HTMLElement {
  const el = document.createElement('div');
  el.className = 'final-actions';
  el.innerHTML = `
    <button class="btn ghost" data-act="export">⬇ Xuất kết quả (CSV)</button>
    <button class="btn" data-act="newGame">🔁 Ván mới (giữ người chơi)</button>
    <button class="btn ghost" data-act="toLobby">🏠 Về sảnh (xoá người chơi)</button>`;
  el.onclick = (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'export') window.dispatchEvent(new CustomEvent('katok:export'));
    if (act === 'newGame' && confirm('Bắt đầu ván mới? Điểm sẽ về 0.')) ctx.send({ type: 'newGame' });
    if (act === 'toLobby' && confirm('Về sảnh và xoá tất cả người chơi?')) ctx.send({ type: 'toLobby' });
  };
  return el;
}

const isLastEnd = (s: HostState) => s.endIndex >= 0 && s.endIndex === s.endSteps.length - 1;
