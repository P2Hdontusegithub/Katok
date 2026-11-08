import { io, type Socket } from 'socket.io-client';
import type { Ack } from '../../shared/types';

export function connect(): Socket {
  return io({ transports: ['websocket', 'polling'], reconnectionDelayMax: 3000 });
}

export function call<T extends Ack = Ack>(socket: Socket, event: string, payload: unknown, timeoutMs = 6000): Promise<T> {
  return new Promise((resolve) => {
    socket.timeout(timeoutMs).emit(event, payload, (err: Error | null, res: T) => {
      resolve(err ? ({ ok: false, error: 'Mất kết nối tới máy chủ.' } as T) : res);
    });
  });
}

/** Shows a "reconnecting…" banner while the socket is down. */
export function connectionBanner(socket: Socket) {
  const el = document.createElement('div');
  el.className = 'conn-banner';
  el.textContent = 'Mất kết nối… đang kết nối lại';
  document.body.appendChild(el);
  let timer = 0;
  socket.on('disconnect', () => {
    timer = window.setTimeout(() => el.classList.add('show'), 800);
  });
  socket.on('connect', () => {
    clearTimeout(timer);
    el.classList.remove('show');
  });
}
