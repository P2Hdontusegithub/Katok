import type { HostAction, HostState, PublicPlayer, RoundRow } from '../../shared/types';
import { ANSWER_LETTERS } from '../../shared/types';
import { countTo, esc, fmtPoints, fmtTime } from '../common/dom';
import { horseSvg, playerColor } from '../common/horse';
import { ANSWER_COLORS, ANSWER_NAMES, shapeSvg } from '../common/shapes';
import { sfx } from '../common/sound';
import type { RaceTrack } from './race';

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
      <aside class="join-card pop-in">
        <div class="join-label">Mở trình duyệt trên điện thoại, vào:</div>
        <div class="join-url"></div>
        <img class="qr" alt="Mã QR tham gia" />
        <div class="join-hint">hoặc quét mã QR 📱</div>
        <select class="url-select" title="Chọn địa chỉ mạng hiển thị"></select>
      </aside>
      <section class="lobby-main">
        <div class="lobby-logo"><h1 class="logo big">Ka<span>-</span>tok</h1><span class="logo-horse">${horseSvg(3, 'running')}</span></div>
        <div class="set-picker">
          <label>Bộ câu hỏi</label>
          <select class="set-select"></select>
          <button class="btn small ghost reload" title="Đọc lại các file JSON trong thư mục questions/">⟳ Tải lại</button>
        </div>
        <div class="set-errors"></div>
        <div class="lobby-count"><b>0</b> người chơi đã vào</div>
        <div class="bubbles"></div>
        <div class="lobby-empty">Đang chờ người chơi… 🐴</div>
      </section>
    </div>`;
  const urlEl = stage.querySelector<HTMLElement>('.join-url')!;
  const qr = stage.querySelector<HTMLImageElement>('.qr')!;
  const urlSel = stage.querySelector<HTMLSelectElement>('.url-select')!;
  const setSel = stage.querySelector<HTMLSelectElement>('.set-select')!;
  const errors = stage.querySelector<HTMLElement>('.set-errors')!;
  const countEl = stage.querySelector<HTMLElement>('.lobby-count b')!;
  const bubbles = stage.querySelector<HTMLElement>('.bubbles')!;
  const empty = stage.querySelector<HTMLElement>('.lobby-empty')!;
  const known = new Map<string, HTMLElement>();
  let first = true;
  let current = s;

  urlSel.onchange = () => {
    if (urlSel.value === '__custom') {
      const url = prompt('Nhập địa chỉ cho người chơi (vd: https://ten-ngau-nhien.trycloudflare.com):', 'https://');
      if (url && url !== 'https://') ctx.send({ type: 'selectUrl', url });
      urlSel.value = current.joinUrl;
      return;
    }
    ctx.send({ type: 'selectUrl', url: urlSel.value });
  };
  setSel.onchange = () => ctx.send({ type: 'selectSet', setId: setSel.value });
  stage.querySelector<HTMLElement>('.reload')!.onclick = () => ctx.send({ type: 'reloadQuestions' });
  bubbles.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.bubble');
    if (b && confirm(`Mời "${b.dataset.name}" ra khỏi phòng?`)) ctx.send({ type: 'kick', playerId: b.dataset.id! });
  };

  const update = (s: HostState) => {
    current = s;
    const shown = s.joinUrl.replace(/^https?:\/\//, '');
    if (urlEl.textContent !== shown) {
      urlEl.textContent = shown;
      qr.src = `/api/qr?text=${encodeURIComponent(s.joinUrl)}`;
    }
    urlSel.innerHTML =
      s.joinUrls.map((u) => `<option ${u === s.joinUrl ? 'selected' : ''}>${esc(u)}</option>`).join('') +
      '<option value="__custom">✎ Nhập địa chỉ khác…</option>';
    setSel.innerHTML = s.questionSets
      .map((q) => `<option value="${esc(q.id)}" ${q.id === s.setId ? 'selected' : ''} ${q.count ? '' : 'disabled'}>${esc(q.title)} (${q.count} câu)</option>`)
      .join('') || '<option>— Chưa có file câu hỏi —</option>';
    const errs = s.questionSets.flatMap((q) => q.errors.map((e) => `<li><b>${esc(q.id)}.json</b>: ${esc(e)}</li>`));
    errors.innerHTML = errs.length ? `<ul>${errs.slice(0, 6).join('')}${errs.length > 6 ? `<li>… và ${errs.length - 6} lỗi khác</li>` : ''}</ul>` : '';

    countEl.textContent = String(s.players.length);
    empty.hidden = s.players.length > 0;
    const ids = new Set(s.players.map((p) => p.id));
    for (const [id, el] of known) {
      if (!ids.has(id)) {
        el.classList.add('leaving');
        setTimeout(() => el.remove(), 300);
        known.delete(id);
      }
    }
    for (const p of s.players) {
      let el = known.get(p.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'bubble';
        el.dataset.id = p.id;
        bubbles.appendChild(el);
        known.set(p.id, el);
        if (!first) sfx.pop();
      }
      if (el.dataset.sig !== `${p.name}|${p.color}`) {
        el.dataset.sig = `${p.name}|${p.color}`;
        el.dataset.name = p.name;
        el.style.setProperty('--pc', playerColor(p.color));
        el.innerHTML = `${horseSvg(p.color)}<span>${esc(p.name)}</span>`;
      }
      el.classList.toggle('offline', !p.connected && !p.manual);
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
    const startFrom = new Map((s.round?.rows ?? []).map((r) => [r.playerId, r.score - r.gained]));
    ctx.track.update(s.players, true, startFrom);
  };
  update(s);
  return { update };
}

// ───────────────────────── Leaderboard ─────────────────────────

function rankDelta(r: RoundRow) {
  const d = r.prevRank - r.rank;
  if (!r.prevRank || d === 0) return '<span class="delta same">•</span>';
  return d > 0 ? `<span class="delta up">▲${d}</span>` : `<span class="delta down">▼${-d}</span>`;
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

  const update = (s: HostState) => {
    small.textContent = s.question ? `· sau câu ${s.question.index + 1} / ${s.question.total}` : '';
    const round = s.round;
    if (round) {
      thead.innerHTML = `<tr><th>Thứ tự</th><th>Người chơi</th><th>Đáp án</th><th>Thời gian</th><th>Điểm lượt này</th><th>Tổng điểm</th></tr>`;
      tbody.innerHTML = round.rows
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

// ───────────────────────── Final ─────────────────────────

export function finalView(stage: HTMLElement, s: HostState, ctx: Ctx): View {
  stage.innerHTML = `
    <div class="final">
      <h1 class="final-title slide-up">🏆 Chung cuộc 🏆</h1>
      <div class="podium"></div>
      <ol class="rest"></ol>
      <div class="final-actions">
        <button class="btn ghost" data-act="export">⬇ Xuất kết quả (CSV)</button>
        <button class="btn" data-act="newGame">🔁 Ván mới (giữ người chơi)</button>
        <button class="btn ghost" data-act="toLobby">🏠 Về sảnh (xoá người chơi)</button>
      </div>
    </div>`;
  stage.querySelector<HTMLElement>('.final-actions')!.onclick = (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'export') window.dispatchEvent(new CustomEvent('katok:export'));
    if (act === 'newGame' && confirm('Bắt đầu ván mới? Điểm sẽ về 0.')) ctx.send({ type: 'newGame' });
    if (act === 'toLobby' && confirm('Về sảnh và xoá tất cả người chơi?')) ctx.send({ type: 'toLobby' });
  };
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
            <div class="spot-block"><span>${['🥇', '🥈', '🥉'][place - 1]}</span></div>
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
