import type { HostAction, HostState } from '../../shared/types';
import { $, decorateBackground, toast } from '../common/dom';
import { call, connect, connectionBanner } from '../common/net';
import { isMuted, setMuted, sfx, startMusic, stopMusic, unlockAudio } from '../common/sound';
import { confetti } from './confetti';
import { JoinPanel } from './join';
import { ManualPanel } from './manual';
import { RaceTrack } from './race';
import { boardView, finalView, getReadyView, lobbyView, questionView, raceView, teamFinalView, type Ctx, type View } from './views';

decorateBackground();
const socket = connect();
connectionBanner(socket);
const TOKEN_KEY = 'katok-host-token';

const login = $('#login');
const app = $('#app');
const stage = $('#stage');
const nextBtn = $<HTMLButtonElement>('#next');

const ctx: Ctx = {
  track: new RaceTrack(),
  async send(action: HostAction) {
    const r = await call(socket, 'host:action', action);
    if (!r.ok) toast(r.error ?? 'Không thực hiện được.', 'error');
    else if (r.error) toast(r.error, 'info');
    return r.ok;
  },
};
const manual = new ManualPanel(ctx);
const join = new JoinPanel(ctx);

let state: HostState | null = null;
let view: View | null = null;
let viewKey = '';

// ───────────────────────── login ─────────────────────────

async function auth(payload: { password?: string; token?: string }) {
  const r = await call<{ ok: boolean; error?: string; token?: string }>(socket, 'host:auth', payload);
  if (r.ok && r.token) {
    sessionStorage.setItem(TOKEN_KEY, r.token);
    login.hidden = true;
    app.hidden = false;
  } else if (payload.password !== undefined) {
    $('#login-error').textContent = r.error ?? 'Lỗi';
    $('#login-card').classList.remove('shake');
    void $('#login-card').offsetWidth;
    $('#login-card').classList.add('shake');
  } else {
    sessionStorage.removeItem(TOKEN_KEY);
    login.hidden = false;
    app.hidden = true;
  }
}

$<HTMLFormElement>('#login-form').onsubmit = (e) => {
  e.preventDefault();
  unlockAudio();
  auth({ password: $<HTMLInputElement>('#password').value });
};

socket.on('connect', () => {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (token) auth({ token });
  else $<HTMLInputElement>('#password').focus();
});

// Browsers only allow sound after a user gesture.
document.addEventListener('pointerdown', () => unlockAudio(), { once: true });

// ───────────────────────── rendering ─────────────────────────

function keyFor(s: HostState) {
  const qi = s.question?.index ?? -1;
  return s.phase === 'question' || s.phase === 'reveal' ? `q-${qi}` : `${s.phase}-${qi}`;
}

function onPhaseChange(prev: HostState | null, s: HostState) {
  if (s.phase !== 'question') stopMusic();
  if (!prev) return;
  switch (s.phase) {
    case 'getready':
      sfx.start();
      break;
    case 'question':
      startMusic();
      break;
    case 'reveal':
      sfx.ring();
      setTimeout(() => sfx.reveal(), 900);
      break;
    case 'leaderboard':
      sfx.pop();
      break;
    case 'teamfinal':
    case 'final':
      sfx.fanfare();
      confetti();
      break;
  }
}

function render(s: HostState) {
  const prev = state;
  state = s;
  if (prev?.phase !== s.phase) onPhaseChange(prev, s);
  if (s.restored && !prev) toast('♻️ Đã khôi phục ván chơi trước khi máy chủ khởi động lại.', 'ok');

  // Keep horses at their pre-round positions so the race screen can animate the gain.
  if (s.phase === 'lobby' || s.phase === 'getready' || s.phase === 'question') ctx.track.update(s.players, s.teams, false);

  const key = keyFor(s);
  if (key !== viewKey) {
    view?.destroy?.();
    viewKey = key;
    stage.className = `stage phase-${s.phase}`;
    switch (s.phase) {
      case 'lobby': view = lobbyView(stage, s, ctx); break;
      case 'getready': view = getReadyView(stage, s); break;
      case 'question':
      case 'reveal': view = questionView(stage, s); break;
      case 'race': view = raceView(stage, s, ctx); break;
      case 'leaderboard': view = boardView(stage, s); break;
      case 'teamfinal': view = teamFinalView(stage, s); break;
      case 'final': view = finalView(stage, s, ctx); break;
    }
  } else {
    view?.update(s);
  }
  manual.update(s);
  join.update(s);
  renderBar(s);
}

const NEXT_LABEL: Record<HostState['phase'], string> = {
  lobby: 'Bắt đầu ▶',
  getready: 'Hiện đáp án ⏭',
  question: 'Dừng ⏹',
  reveal: 'Đường đua 🏇',
  race: 'Bảng điểm 📋',
  leaderboard: 'Câu tiếp ▶',
  teamfinal: 'Bục cá nhân 🏅',
  final: '',
};

function renderBar(s: HostState) {
  const last = s.question && s.question.index + 1 >= s.question.total;
  let label = NEXT_LABEL[s.phase];
  if (s.phase === 'leaderboard' && s.question === null && s.round === null) label = 'Tiếp tục ▶';
  if (s.phase === 'leaderboard' && last) label = 'Kết quả chung cuộc 🏆';
  nextBtn.textContent = label;
  nextBtn.hidden = !label;
  $('#bar-set').textContent = s.setTitle || 'Ka-tok';
  $('#bar-q').textContent = s.question ? `Câu ${s.question.index + 1}/${s.question.total}` : '';
  $('#bar-players').textContent = `👥 ${s.players.filter((p) => p.connected || p.manual).length}/${s.players.length}`;
  $<HTMLButtonElement>('#btn-join').hidden = s.phase === 'lobby';
  $<HTMLButtonElement>('#btn-race').hidden = !['reveal', 'leaderboard', 'teamfinal', 'final'].includes(s.phase);
  $<HTMLButtonElement>('#btn-board').hidden = !['race', 'teamfinal', 'final'].includes(s.phase);
}

socket.on('host:state', (s: HostState) => render(s));

// ───────────────────────── controls ─────────────────────────

async function next() {
  if (!state) return;
  if (state.phase === 'lobby' && state.players.length === 0 && !confirm('Chưa có người chơi nào. Vẫn bắt đầu?')) return;
  unlockAudio();
  nextBtn.disabled = true;
  await ctx.send({ type: 'next' });
  nextBtn.disabled = false;
}

nextBtn.onclick = next;
$('#btn-manual').onclick = () => manual.toggle();
$('#btn-join').onclick = () => join.toggle();
$('#btn-race').onclick = () => ctx.send({ type: 'goto', phase: 'race' });
$('#btn-board').onclick = () => ctx.send({ type: 'goto', phase: 'leaderboard' });
$('#btn-full').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());

const soundBtn = $('#btn-sound');
const paintSound = () => (soundBtn.textContent = isMuted() ? '🔇' : '🔊');
paintSound();
soundBtn.onclick = () => {
  setMuted(!isMuted());
  paintSound();
};

const menu = $('#menu');
$('#btn-menu').onclick = (e) => {
  e.stopPropagation();
  menu.hidden = !menu.hidden;
};
document.addEventListener('click', () => (menu.hidden = true));

function exportCsv() {
  const token = sessionStorage.getItem(TOKEN_KEY) ?? '';
  window.location.href = `/api/export.csv?token=${encodeURIComponent(token)}`;
}
window.addEventListener('katok:export', exportCsv);

menu.onclick = (e) => {
  const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
  switch (act) {
    case 'end':
      if (confirm('Kết thúc trò chơi ngay và hiện kết quả chung cuộc?')) ctx.send({ type: 'end' });
      break;
    case 'newGame':
      if (confirm('Bắt đầu ván mới? Điểm của mọi người về 0, giữ danh sách người chơi.')) ctx.send({ type: 'newGame' });
      break;
    case 'toLobby':
      if (confirm('Về sảnh và XOÁ tất cả người chơi?')) ctx.send({ type: 'toLobby' });
      break;
    case 'export':
      exportCsv();
      break;
    case 'reload':
      ctx.send({ type: 'reloadQuestions' }).then((ok) => ok && toast('Đã tải lại câu hỏi.', 'ok'));
      break;
    case 'logout':
      sessionStorage.removeItem(TOKEN_KEY);
      location.reload();
      break;
  }
};

document.addEventListener('keydown', (e) => {
  if (app.hidden) return;
  const typing = (e.target as HTMLElement).closest('input, textarea, select');
  if (e.key === 'Escape' && manual.open) return manual.toggle(false);
  if (e.key === 'Escape' && join.open) return join.toggle(false);
  if (typing || manual.open) return;
  if (e.key.toLowerCase() === 'j') {
    if (state?.phase !== 'lobby') join.toggle();
    return;
  }
  if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
    e.preventDefault();
    if (!nextBtn.hidden && !nextBtn.disabled) next();
  } else if (e.key.toLowerCase() === 'm') manual.toggle();
  else if (e.key.toLowerCase() === 'f') $('#btn-full').click();
});
