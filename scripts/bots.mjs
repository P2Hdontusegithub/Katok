// Fake players for rehearsing / load testing.
//   npm run bots                 → 8 bots on http://localhost:3000
//   npm run bots -- 40 http://192.168.1.5:3000
import { io } from 'socket.io-client';

const count = Number(process.argv[2] ?? 8);
const url = process.argv[3] ?? `http://localhost:${process.env.PORT ?? 3000}`;
const NAMES = ['Lan', 'Minh', 'Hùng', 'Thảo', 'Tuấn', 'Vy', 'Khoa', 'Ngọc', 'Phúc', 'Trang', 'Đạt', 'Hà', 'Long', 'My', 'Quân', 'Linh'];

for (let i = 0; i < count; i++) {
  const socket = io(url, { transports: ['websocket'] });
  const name = `${NAMES[i % NAMES.length]}${i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ''} 🤖`;
  let token;
  let answeredIndex = -1;
  socket.on('connect', () => {
    socket.emit('player:join', { name, token }, (r) => {
      if (r.ok) token = r.token;
      else console.log(`${name}: ${r.error}`);
    });
  });
  socket.on('player:state', (s) => {
    if (s?.phase !== 'question' || !s.question || answeredIndex === s.question.index) return;
    answeredIndex = s.question.index;
    const skill = 0.35 + (i % 5) * 0.12;
    const delay = 600 + Math.random() * Math.min(s.question.remainingMs * 0.8, 12000) * (1.2 - skill);
    const t0 = Date.now();
    setTimeout(() => {
      const choice = Math.floor(Math.random() * s.question.answerCount);
      socket.emit('player:answer', { choice, elapsed: Date.now() - t0 }, () => {});
    }, delay);
  });
  socket.on('player:kicked', () => socket.close());
}
console.log(`🤖 ${count} bot đang kết nối tới ${url} (Ctrl + C để dừng)`);
