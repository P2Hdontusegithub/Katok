import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import express from 'express';
import QRCode from 'qrcode';
import { Server, type Socket } from 'socket.io';
import type { Ack, HostAction } from '../shared/types';
import { loadConfig, ROOT } from './config';
import { Db } from './db';
import { Game } from './game';
import { lanAddresses } from './net';
import { loadQuestionSets } from './questions';

const cfg = loadConfig();
const QUESTIONS_DIR = path.join(ROOT, 'questions');
const DATA_DIR = path.join(ROOT, 'data');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 20000 });
const db = new Db(path.join(DATA_DIR, 'ka-tok.sqlite'));
// One token for all host screens; it survives server restarts (the secret is
// stored in the DB) and becomes invalid when the password changes.
let secret = db.getValue('secret');
if (!secret) db.setValue('secret', (secret = randomBytes(16).toString('hex')));
const HOST_TOKEN = createHash('sha256').update(`${secret}:${cfg.hostPassword}`).digest('hex');

// ───────────────────────── broadcasting ─────────────────────────
// Updates are coalesced so a burst of answers produces one emit per tick.

let pendingAll = false;
let pendingHosts = false;
const pendingPlayers = new Set<string>();
let flushScheduled = false;
let lastTeams = '';

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  setImmediate(() => {
    flushScheduled = false;
    if (pendingAll || pendingHosts) io.to('hosts').emit('host:state', game.hostState());
    if (pendingAll) {
      // The team list also goes to phones still on the join screen.
      const teams = JSON.stringify(game.teamOptions());
      if (teams !== lastTeams) {
        lastTeams = teams;
        io.except('hosts').emit('teams', game.teamOptions());
      }
    }
    const ids = pendingAll ? game.playerIds() : [...pendingPlayers];
    for (const id of ids) {
      const sid = game.socketOf(id);
      if (sid) io.to(sid).emit('player:state', game.playerState(id));
    }
    pendingAll = pendingHosts = false;
    pendingPlayers.clear();
  });
}

const game = new Game(
  cfg,
  db,
  {
    all: () => {
      pendingAll = true;
      scheduleFlush();
    },
    hosts: () => {
      pendingHosts = true;
      scheduleFlush();
    },
    player: (id) => {
      pendingPlayers.add(id);
      scheduleFlush();
    },
    kicked: (socketId) => {
      const s = io.sockets.sockets.get(socketId);
      if (s) {
        s.data.playerId = undefined;
        s.emit('player:kicked');
      }
    },
  },
  (gameId) => {
    try {
      const dir = path.join(DATA_DIR, 'results');
      fs.mkdirSync(dir, { recursive: true });
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
      fs.writeFileSync(path.join(dir, `ka-tok-${stamp}-${gameId}.csv`), toCsv());
    } catch (err) {
      console.error('Không ghi được file kết quả:', err);
    }
  },
);

function reloadQuestions() {
  const sets = loadQuestionSets(QUESTIONS_DIR);
  for (const s of sets) for (const e of s.errors) console.warn(`⚠️  questions/${s.id}.json — ${e}`);
  game.setQuestionSets(sets);
  return sets;
}

function toCsv() {
  const { header, rows } = game.exportRows();
  const esc = (v: string | number) => (/[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return '﻿' + [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
}

// ───────────────────────── HTTP ─────────────────────────

app.disable('x-powered-by');
app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));
app.use('/fonts/baloo', express.static(path.join(ROOT, 'node_modules/@fontsource-variable/baloo-2')));
app.use('/media', express.static(QUESTIONS_DIR));

app.get('/api/qr', async (req, res) => {
  const text = String(req.query.text ?? '').slice(0, 500);
  if (!text) return void res.status(400).end();
  const svg = await QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#2b1055', light: '#ffffff' } });
  res.type('image/svg+xml').send(svg);
});

app.get('/api/export.csv', (req, res) => {
  if (req.query.token !== HOST_TOKEN) return void res.status(403).send('Forbidden');
  res.setHeader('Content-Disposition', `attachment; filename="ka-tok-ket-qua.csv"`);
  res.type('text/csv; charset=utf-8').send(toCsv());
});

// ───────────────────────── sockets ─────────────────────────

function isHost(socket: Socket) {
  return socket.data.host === true;
}

io.on('connection', (socket) => {
  socket.emit('teams', game.teamOptions());

  socket.on('host:auth', (payload: { password?: string; token?: string }, ack: (r: Ack & { token?: string }) => void) => {
    const ok = payload?.token === HOST_TOKEN || (typeof payload?.password === 'string' && payload.password === cfg.hostPassword);
    const token = ok ? HOST_TOKEN : undefined;
    if (!token) return ack?.({ ok: false, error: payload?.password !== undefined ? 'Sai mật khẩu.' : 'Phiên đã hết hạn.' });
    socket.data.host = true;
    socket.join('hosts');
    ack?.({ ok: true, token });
    socket.emit('host:state', game.hostState());
    game.clearRestoredFlag();
  });

  socket.on('host:action', (action: HostAction, ack: (r: Ack) => void) => {
    if (!isHost(socket)) return ack?.({ ok: false, error: 'Chưa đăng nhập host.' });
    let r: Ack = { ok: true };
    try {
      switch (action?.type) {
        case 'start': r = game.start(); break;
        case 'next': r = game.next(); break;
        case 'goto': r = game.goto(action.phase); break;
        case 'end': r = game.end(); break;
        case 'newGame': game.reset(true); break;
        case 'toLobby': game.reset(false); break;
        case 'selectSet': r = game.selectSet(action.setId); break;
        case 'reloadQuestions': {
          const sets = reloadQuestions();
          const bad = sets.filter((s) => s.errors.length).length;
          r = { ok: true, error: bad ? `${bad} bộ câu hỏi có lỗi` : undefined };
          io.to('hosts').emit('host:state', game.hostState());
          break;
        }
        case 'selectUrl': {
          // Any http(s) address is accepted, e.g. a tunnel URL for players on 4G.
          const url = String(action.url ?? '').trim().replace(/\/$/, '');
          if (!/^https?:\/\/[^\s/]+/i.test(url)) {
            r = { ok: false, error: 'Địa chỉ phải bắt đầu bằng http:// hoặc https://' };
            break;
          }
          if (!game.joinUrls.includes(url)) game.joinUrls.unshift(url);
          game.joinUrl = url;
          io.to('hosts').emit('host:state', game.hostState());
          break;
        }
        case 'kick': r = game.kick(action.playerId); break;
        case 'rename': r = game.rename(action.playerId, String(action.name ?? '')); break;
        case 'addPlayer': r = game.addManualPlayer(String(action.name ?? '')); break;
        case 'adjust': r = game.adjust(Array.isArray(action.changes) ? action.changes : [], String(action.reason ?? ''), !!action.showRace); break;
        case 'setScore': r = game.setScore(action.playerId, Number(action.score)); break;
        case 'createTeam': r = game.createTeam(String(action.name ?? ''), Number(action.color)); break;
        case 'updateTeam':
          r = game.updateTeam(
            String(action.teamId),
            action.name === undefined ? undefined : String(action.name),
            action.color === undefined ? undefined : Number(action.color),
          );
          break;
        case 'deleteTeam': r = game.deleteTeam(String(action.teamId)); break;
        case 'setTeam': r = game.setTeam(String(action.playerId), action.teamId ? String(action.teamId) : null); break;
        default: r = { ok: false, error: 'Lệnh không hợp lệ.' };
      }
    } catch (err) {
      console.error(err);
      r = { ok: false, error: 'Lỗi máy chủ.' };
    }
    ack?.(r);
  });

  socket.on('player:join', (payload: { name?: string; token?: string; teamId?: string }, ack: (r: Ack & { token?: string }) => void) => {
    const r = game.join(socket.id, payload?.name, payload?.token, payload?.teamId ? String(payload.teamId) : null);
    if (r.ok && r.playerId) {
      socket.data.playerId = r.playerId;
      socket.emit('player:state', game.playerState(r.playerId));
    }
    ack?.({ ok: r.ok, error: r.error, token: r.token });
  });

  socket.on('player:answer', (payload: { choice: number; elapsed?: number }, ack: (r: Ack) => void) => {
    const id = socket.data.playerId as string | undefined;
    if (!id) return ack?.({ ok: false, error: 'Bạn chưa vào phòng.' });
    ack?.(game.answer(id, Number(payload?.choice), payload?.elapsed));
  });

  socket.on('player:color', (_: unknown, ack: (r: Ack) => void) => {
    const id = socket.data.playerId as string | undefined;
    ack?.(id ? game.changeColor(id) : { ok: false });
  });

  socket.on('player:team', (payload: { teamId?: string | null }, ack: (r: Ack) => void) => {
    const id = socket.data.playerId as string | undefined;
    ack?.(id ? game.setTeam(id, payload?.teamId ? String(payload.teamId) : null) : { ok: false, error: 'Bạn chưa vào phòng.' });
  });

  socket.on('disconnect', () => game.disconnect(socket.id));
});

// ───────────────────────── start ─────────────────────────

reloadQuestions();
const restored = game.restore(db.loadSnapshot());

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Cổng ${cfg.port} đang bị chương trình khác dùng. Đổi "port" trong config.json hoặc tắt chương trình kia.\n`);
  } else console.error(err);
  process.exit(1);
});

server.listen(cfg.port, '0.0.0.0', () => {
  const ips = lanAddresses();
  const lanUrls = ips.map((ip) => `http://${ip}:${cfg.port}`);
  game.joinUrls = [...(cfg.publicUrl ? [cfg.publicUrl.replace(/\/$/, '')] : []), ...lanUrls, `http://localhost:${cfg.port}`];
  game.joinUrl = game.joinUrls[0];
  const line = '─'.repeat(56);
  console.log(`\n${line}\n  🏇  KA-TOK đã chạy!\n${line}`);
  console.log(`  Host (máy chiếu):   http://localhost:${cfg.port}/host`);
  console.log(`  Mật khẩu host:      ${cfg.hostPassword}`);
  console.log(`  Người chơi vào:`);
  for (const u of game.joinUrls.slice(0, -1)) console.log(`     → ${u}`);
  if (!ips.length) console.log('     (không tìm thấy mạng LAN — hãy kết nối Wi-Fi/hotspot)');
  if (restored) console.log(`\n  ♻️  Đã khôi phục ván chơi trước khi tắt máy chủ.`);
  console.log(`${line}\n  Nhấn Ctrl + C để tắt.\n`);
});
