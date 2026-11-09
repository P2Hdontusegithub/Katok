import type { PlayerState, TeamOption } from '../../shared/types';
import { ANSWER_LETTERS } from '../../shared/types';
import { $, decorateBackground, esc, fmtPoints, fmtTime, toast } from '../common/dom';
import { horseSvg, playerColor } from '../common/horse';
import { call, connect, connectionBanner } from '../common/net';
import { ANSWER_COLORS, ANSWER_NAMES, shapeSvg } from '../common/shapes';
import { sfx, unlockAudio } from '../common/sound';

decorateBackground();
const socket = connect();
connectionBanner(socket);

const TOKEN_KEY = 'katok-player-token';
const NAME_KEY = 'katok-player-name';

const joinEl = $('#join');
const gameEl = $('#game');
const screen = $('#screen');
const nameInput = $<HTMLInputElement>('#name');
nameInput.value = localStorage.getItem(NAME_KEY) ?? '';

let state: PlayerState | null = null;
let screenKey = '';
let questionSeenAt = 0;
let questionSeenIndex = -1;
let pendingChoice: number | null = null;
let timerRaf = 0;
let lastResultKey = '';
/** Teams that can still be picked (empty when there are none or the game has started). */
let teams: TeamOption[] = [];
let joinTeam: string | null = null;

// ───────────────────────── teams ─────────────────────────

function teamButtons(selected: string | null) {
  return teams
    .map((t) => {
      const full = t.count >= t.max && t.id !== selected;
      return `<button type="button" class="team-btn ${t.id === selected ? 'on' : ''}" data-team="${t.id}" style="--pc:${playerColor(t.color)}" ${full ? 'disabled' : ''}>
        <i class="dot"></i><span>${esc(t.name)}</span><small>${full ? 'Đủ người' : `${t.count}/${t.max}`}</small></button>`;
    })
    .join('');
}

const joinTeams = $('#join-teams');
function renderJoinTeams() {
  const open = teams.filter((t) => t.count < t.max);
  if (!open.some((t) => t.id === joinTeam)) joinTeam = null;
  joinTeams.hidden = !open.length;
  joinTeams.innerHTML = `<div class="team-pick-title">Chọn đội của bạn</div>${teamButtons(joinTeam)}`;
}
joinTeams.onclick = (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.team-btn');
  if (!b || b.disabled) return;
  joinTeam = b.dataset.team!;
  renderJoinTeams();
};

socket.on('teams', (list: TeamOption[]) => {
  teams = list;
  renderJoinTeams();
  if (state?.phase !== 'lobby') return;
  const pick = document.getElementById('lobby-teams');
  if (pick && teams.length) {
    pick.innerHTML = pick.firstElementChild!.outerHTML + teamButtons(state.me.teamId);
  } else {
    screenKey = '';
    render(state);
  }
});

// ───────────────────────── joining ─────────────────────────

async function join(name?: string) {
  const token = localStorage.getItem(TOKEN_KEY) ?? undefined;
  if (name !== undefined && !joinTeams.hidden && !joinTeam) {
    $('#join-error').textContent = 'Chọn đội của bạn nhé!';
    return;
  }
  const r = await call<{ ok: boolean; error?: string; token?: string }>(socket, 'player:join', { name, token, teamId: joinTeam });
  if (r.ok && r.token) {
    localStorage.setItem(TOKEN_KEY, r.token);
    joinEl.hidden = true;
    gameEl.hidden = false;
    keepAwake();
    return;
  }
  if (r.error === 'unknown-token') {
    localStorage.removeItem(TOKEN_KEY);
    showJoin();
    return;
  }
  $('#join-error').textContent = r.error ?? 'Không vào được.';
  $('#join-card').classList.remove('shake');
  void $('#join-card').offsetWidth;
  $('#join-card').classList.add('shake');
}

function showJoin() {
  joinEl.hidden = false;
  gameEl.hidden = true;
  screenKey = '';
}

$<HTMLFormElement>('#join-form').onsubmit = (e) => {
  e.preventDefault();
  unlockAudio();
  const name = nameInput.value.trim();
  localStorage.setItem(NAME_KEY, name);
  localStorage.removeItem(TOKEN_KEY);
  join(name);
};

socket.on('connect', () => {
  if (localStorage.getItem(TOKEN_KEY)) join();
  else showJoin();
});

socket.on('player:kicked', () => {
  localStorage.removeItem(TOKEN_KEY);
  state = null;
  screenKey = 'kicked';
  joinEl.hidden = true;
  gameEl.hidden = false;
  screen.innerHTML = `
    <div class="panel center pop-in">
      <div class="big-emoji">👋</div>
      <h2>Bạn đã rời phòng</h2>
      <p>Host đã đưa bạn ra khỏi trò chơi hoặc mở phòng mới.</p>
      <button class="btn" id="rejoin">Vào lại</button>
    </div>`;
  $('#rejoin').onclick = showJoin;
});

// Keep the phone screen on during the game.
let wakeLock: any = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await (navigator as any).wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    }
  } catch {
    /* not supported – fine */
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !gameEl.hidden) keepAwake();
});

// ───────────────────────── rendering ─────────────────────────

function renderTop(s: PlayerState) {
  $('#me-name').textContent = s.me.name;
  $('#me-horse').innerHTML = horseSvg(s.me.color);
  $('#me-score').textContent = fmtPoints(s.me.score);
  const teamEl = $('#me-team');
  teamEl.hidden = !s.myTeam;
  teamEl.textContent = s.myTeam ? `Đội ${s.myTeam.name}` : '';
  document.documentElement.style.setProperty('--pc', playerColor(s.me.color));
  if (s.myTeam) document.documentElement.style.setProperty('--tc', playerColor(s.myTeam.color));
}

function renderLobby(s: PlayerState) {
  // With teams set up, the colour comes from the team and the player picks (or switches) a team here.
  const picker = teams.length
    ? `<div class="team-pick" id="lobby-teams"><div class="team-pick-title">${s.me.teamId ? 'Đổi đội (trước khi bắt đầu)' : 'Chọn đội của bạn'}</div>${teamButtons(s.me.teamId)}</div>`
    : '<button class="btn ghost" id="color">🎨 Đổi màu ngựa</button>';
  screen.innerHTML = `
    <div class="panel center pop-in">
      <div class="lobby-horse">${horseSvg(s.me.color, 'running')}</div>
      <h2>Bạn đã vào rồi! 🎉</h2>
      <p class="you">${esc(s.me.name)}</p>
      ${s.myTeam ? `<p class="team-line">Đội <b>${esc(s.myTeam.name)}</b></p>` : ''}
      <p>Nhìn lên màn hình lớn và chờ host bắt đầu nhé.</p>
      ${picker}
    </div>`;
  const colorBtn = document.getElementById('color');
  if (colorBtn) colorBtn.onclick = () => call(socket, 'player:color', {});
  const pick = document.getElementById('lobby-teams');
  if (pick) {
    pick.onclick = async (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.team-btn');
      if (!b || b.disabled || b.dataset.team === s.me.teamId) return;
      const r = await call(socket, 'player:team', { teamId: b.dataset.team });
      if (!r.ok) toast(r.error ?? 'Không đổi được đội.', 'error');
    };
  }
}

function startTimer(endsAt: number, el: HTMLElement) {
  cancelAnimationFrame(timerRaf);
  const step = () => {
    const left = Math.max(0, endsAt - performance.now());
    el.textContent = String(Math.ceil(left / 1000));
    if (left > 0) timerRaf = requestAnimationFrame(step);
  };
  step();
}

function render(s: PlayerState) {
  state = s;
  renderTop(s);
  const q = s.question;
  if (s.phase === 'question' && q && questionSeenIndex !== q.index) {
    questionSeenIndex = q.index;
    questionSeenAt = performance.now();
    pendingChoice = null;
  }
  const answered = s.myAnswer !== null || pendingChoice !== null;
  const key = `${s.phase}|${q?.index ?? ''}|${answered}|${s.result ? 'r' : ''}|${s.me.color}|${s.me.teamId}|${s.honor ?? ''}`;
  if (key === screenKey) {
    updateLive(s);
    return;
  }
  screenKey = key;
  cancelAnimationFrame(timerRaf);

  switch (s.phase) {
    case 'lobby':
      renderLobby(s);
      break;

    case 'getready':
      screen.innerHTML = `
        <div class="panel center">
          <div class="q-chip">Câu ${q!.index + 1} / ${q!.total}</div>
          <h2 class="pulse">Chuẩn bị…</h2>
          <div class="ready-num" id="ready-num"></div>
          <p>Đọc câu hỏi trên màn hình lớn!</p>
        </div>`;
      startTimer(performance.now() + q!.remainingMs, $('#ready-num'));
      break;

    case 'question':
      if (answered) renderAnswered(s);
      else renderButtons(s);
      break;

    case 'reveal':
    case 'race':
    case 'leaderboard':
      renderResult(s);
      break;

    case 'awards':
      if (s.honor) {
        navigator.vibrate?.([60, 80, 60, 80, 120]);
        sfx.correct();
      }
      screen.innerHTML = s.honor
        ? `
        <div class="panel center pop-in final-card">
          <div class="big-emoji">🎉</div>
          <h2>Bạn được vinh danh!</h2>
          <p class="honor">${esc(s.honor)}</p>
          <div class="lobby-horse">${horseSvg(s.me.color, 'running')}</div>
          <p>Nhìn lên màn hình lớn nào!</p>
        </div>`
        : `
        <div class="panel center pop-in">
          <div class="big-emoji">🏅</div>
          <h2>Đang trao giải…</h2>
          <p>Nhìn lên màn hình lớn nhé!</p>
          <div class="rank-line">Bạn đang hạng <b>${s.me.rank}</b> / ${s.me.total}</div>
        </div>`;
      break;

    case 'teamfinal': {
      const t = s.myTeam;
      if (!t) {
        screen.innerHTML = `
          <div class="panel center pop-in">
            <div class="big-emoji">🏆</div>
            <h2>Đang công bố kết quả đội…</h2>
            <p>Kết quả cá nhân sẽ có ngay sau đây!</p>
          </div>`;
        break;
      }
      const medal = ['🥇', '🥈', '🥉'][t.rank - 1] ?? '🏁';
      screen.innerHTML = `
        <div class="panel center pop-in final-card">
          <div class="big-emoji">${medal}</div>
          <p class="team-line">Đội <b>${esc(t.name)}</b></p>
          <h2>Hạng ${t.rank} / ${t.total}</h2>
          <div class="final-score">${fmtPoints(t.score)} <small>điểm đội</small></div>
          <div class="lobby-horse">${horseSvg(t.color, t.rank <= 3 ? 'running' : '')}</div>
          <p>${t.rank === 1 ? 'Đội bạn vô địch! 🏆' : t.rank <= 3 ? 'Đội bạn lên bục rồi!' : 'Cả đội đã chiến đấu hết mình!'}</p>
        </div>`;
      break;
    }

    case 'final': {
      const medal = ['🥇', '🥈', '🥉'][s.me.rank - 1] ?? '🏁';
      screen.innerHTML = `
        <div class="panel center pop-in final-card">
          <div class="big-emoji">${medal}</div>
          <h2>Hạng ${s.me.rank} / ${s.me.total}</h2>
          <div class="final-score">${fmtPoints(s.me.score)} <small>điểm</small></div>
          <div class="lobby-horse">${horseSvg(s.me.color, s.me.rank <= 3 ? 'running' : '')}</div>
          <p>${s.me.rank === 1 ? 'Vô địch! Ngựa của bạn về nhất! 🏆' : s.me.rank <= 3 ? 'Tuyệt vời, lên bục rồi!' : 'Cảm ơn bạn đã tham gia!'}</p>
          ${s.myTeam ? `<p class="team-line">Đội <b>${esc(s.myTeam.name)}</b>: hạng ${s.myTeam.rank} / ${s.myTeam.total}</p>` : ''}
        </div>`;
      break;
    }
  }
}

function updateLive(s: PlayerState) {
  if (s.phase === 'question' && s.question) {
    const t = document.getElementById('q-timer');
    if (t) startTimer(performance.now() + s.question.remainingMs, t);
  }
}

function renderButtons(s: PlayerState) {
  const q = s.question!;
  screen.innerHTML = `
    <div class="answer-screen">
      <div class="q-info"><span>Câu ${q.index + 1}/${q.total}</span><span class="q-timer" id="q-timer"></span></div>
      <div class="pads n${q.answerCount}">
        ${Array.from({ length: q.answerCount }, (_, i) => `
          <button class="pad ${ANSWER_NAMES[i]}" data-i="${i}" style="--ac:${ANSWER_COLORS[i]}" aria-label="Đáp án ${ANSWER_LETTERS[i]}">
            ${shapeSvg(i)}<span>${ANSWER_LETTERS[i]}</span>
          </button>`).join('')}
      </div>
    </div>`;
  startTimer(performance.now() + q.remainingMs, $('#q-timer'));
  screen.querySelectorAll<HTMLButtonElement>('.pad').forEach((b) => {
    b.addEventListener('pointerdown', () => choose(Number(b.dataset.i)), { once: true });
  });
}

async function choose(i: number) {
  if (pendingChoice !== null || !state || state.phase !== 'question') return;
  const elapsed = performance.now() - questionSeenAt;
  pendingChoice = i;
  navigator.vibrate?.(35);
  sfx.click();
  const s = state;
  screenKey = '';
  render(s);
  const r = await call(socket, 'player:answer', { choice: i, elapsed });
  if (!r.ok) {
    toast(r.error ?? 'Không gửi được.', 'error');
    if (state?.phase === 'question' && !state.myAnswer) {
      pendingChoice = null;
      screenKey = '';
      render(state);
    }
  }
}

function renderAnswered(s: PlayerState) {
  const choice = s.myAnswer?.choice ?? pendingChoice!;
  screen.innerHTML = `
    <div class="panel center pop-in">
      <div class="chosen" style="--ac:${ANSWER_COLORS[choice]}">${shapeSvg(choice)}<span>${ANSWER_LETTERS[choice]}</span></div>
      <h2>Đã chọn!</h2>
      <p class="answer-time">⏱ ${s.myAnswer ? fmtTime(s.myAnswer.timeMs) : 'đang gửi…'}</p>
      <div class="dots"><i></i><i></i><i></i></div>
      <p>Chờ mọi người trả lời…</p>
    </div>`;
}

function renderResult(s: PlayerState) {
  const r = s.result;
  if (!r) {
    screen.innerHTML = `
      <div class="panel center pop-in">
        <div class="lobby-horse">${horseSvg(s.me.color, 'running')}</div>
        <h2>Chờ câu tiếp theo…</h2>
        <p>Bạn đang hạng ${s.me.rank} / ${s.me.total}</p>
      </div>`;
    return;
  }
  const resultKey = `${state?.question?.index ?? ''}|${s.me.score}`;
  if (resultKey !== lastResultKey && s.phase === 'reveal') {
    lastResultKey = resultKey;
    if (r.correct) sfx.correct();
    else sfx.wrong();
    navigator.vibrate?.(r.correct ? [40, 60, 40] : 200);
  }
  const cls = r.correct ? 'good' : 'bad';
  const title = r.correct ? 'Chính xác!' : r.answered ? 'Sai rồi!' : 'Hết giờ!';
  const correctIcons = r.correctChoices
    .map((c) => `<span class="mini-ans" style="--ac:${ANSWER_COLORS[c]}">${shapeSvg(c)}${ANSWER_LETTERS[c]}</span>`)
    .join('');
  screen.innerHTML = `
    <div class="result ${cls} pop-in">
      <div class="result-icon">${r.correct ? '✔' : '✘'}</div>
      <h2>${title}</h2>
      ${r.timeMs !== null ? `<p class="answer-time">⏱ ${fmtTime(r.timeMs)}</p>` : ''}
      <div class="gain-badge">${r.gained > 0 ? '+' : ''}${fmtPoints(r.gained)}</div>
      ${r.correct ? '' : `<p>Đáp án đúng: ${correctIcons}</p>`}
      <div class="rank-line">Hạng <b>${s.me.rank}</b> / ${s.me.total}</div>
      <div class="lobby-horse">${horseSvg(s.me.color, r.gained > 0 ? 'running' : '')}</div>
    </div>`;
}

socket.on('player:state', (s: PlayerState | null) => {
  if (!s) return;
  joinEl.hidden = true;
  gameEl.hidden = false;
  render(s);
});
