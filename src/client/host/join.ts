// "How to join" card (link + QR + network address picker), shared by the lobby
// and by the 📱 overlay that can be opened at any time during the game.
import type { HostState } from '../../shared/types';
import { esc } from '../common/dom';
import type { Ctx } from './views';

export const JOIN_CARD_HTML = `
  <div class="join-label">Mở trình duyệt trên điện thoại, vào:</div>
  <div class="join-url"></div>
  <img class="qr" alt="Mã QR tham gia" />
  <div class="join-hint">hoặc quét mã QR 📱</div>
  <select class="url-select" title="Chọn địa chỉ mạng hiển thị"></select>
  <div class="lan-warning" hidden></div>`;

const qrSrc = (url: string) => `/api/qr?text=${encodeURIComponent(url)}`;

/** Wires up a container holding JOIN_CARD_HTML; returns its update function. */
export function bindJoinCard(root: HTMLElement, ctx: Ctx): (s: HostState) => void {
  const urlEl = root.querySelector<HTMLElement>('.join-url')!;
  const qr = root.querySelector<HTMLImageElement>('.qr')!;
  const urlSel = root.querySelector<HTMLSelectElement>('.url-select')!;
  const lanWarn = root.querySelector<HTMLElement>('.lan-warning')!;
  let current: HostState | null = null;
  let optionsSig = '';

  urlSel.onchange = () => {
    if (urlSel.value === '__custom') {
      const url = prompt('Nhập địa chỉ cho người chơi (vd: https://ten-ngau-nhien.trycloudflare.com):', 'https://');
      if (url && url !== 'https://') ctx.send({ type: 'selectUrl', url });
      if (current) urlSel.value = current.joinUrl;
      return;
    }
    ctx.send({ type: 'selectUrl', url: urlSel.value });
  };

  return (s: HostState) => {
    current = s;
    // Only relevant while the QR points to a LAN IP (a tunnel bypasses the firewall).
    const lanUrl = /^https?:\/\/(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(s.joinUrl);
    lanWarn.hidden = !(s.lanWarning && lanUrl);
    if (!lanWarn.hidden) lanWarn.textContent = `⚠️ ${s.lanWarning}`;
    const shown = s.joinUrl.replace(/^https?:\/\//, '');
    if (urlEl.textContent !== shown) {
      urlEl.textContent = shown;
      qr.src = qrSrc(s.joinUrl);
    }
    // Rebuilding the options while the dropdown is open would close it, so only do it on change.
    const sig = JSON.stringify([s.joinUrls, s.joinUrl]);
    if (sig !== optionsSig) {
      optionsSig = sig;
      urlSel.innerHTML =
        s.joinUrls.map((u) => `<option ${u === s.joinUrl ? 'selected' : ''}>${esc(u)}</option>`).join('') +
        '<option value="__custom">✎ Nhập địa chỉ khác…</option>';
    }
  };
}

const PIN_KEY = 'katok-join-pinned';

function readPin(): boolean {
  try {
    return localStorage.getItem(PIN_KEY) === '1';
  } catch {
    return false;
  }
}

function writePin(on: boolean) {
  try {
    localStorage.setItem(PIN_KEY, on ? '1' : '0');
  } catch {
    /* private mode – the pin just won't be remembered */
  }
}

/** 📱 overlay with a big QR, plus an optional small QR pinned in the corner. */
export class JoinPanel {
  readonly el: HTMLElement;
  private readonly mini: HTMLElement;
  private readonly miniQr: HTMLImageElement;
  private readonly miniUrl: HTMLElement;
  private readonly pinBtn: HTMLButtonElement;
  private readonly updateCard: (s: HostState) => void;
  private pinned = readPin();
  private phase: HostState['phase'] = 'lobby';
  private url = '';
  open = false;

  constructor(ctx: Ctx) {
    this.el = document.createElement('div');
    this.el.className = 'modal join-modal';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="join-card join-big" role="dialog" aria-label="Tham gia trò chơi">
        <button class="icon-btn join-close" title="Đóng (Esc)">✕</button>
        ${JOIN_CARD_HTML}
        <button class="btn small ghost join-pin"></button>
      </div>`;
    this.el.onclick = (e) => {
      if (e.target === this.el || (e.target as HTMLElement).closest('.join-close')) this.toggle(false);
    };
    this.pinBtn = this.el.querySelector<HTMLButtonElement>('.join-pin')!;
    this.pinBtn.onclick = () => {
      this.pinned = !this.pinned;
      writePin(this.pinned);
      this.paint();
    };
    this.updateCard = bindJoinCard(this.el.querySelector<HTMLElement>('.join-card')!, ctx);

    this.mini = document.createElement('button');
    this.mini.className = 'join-mini';
    this.mini.title = 'Bấm để phóng to mã QR (J)';
    this.mini.innerHTML = `<img alt="Mã QR tham gia" /><span></span>`;
    this.mini.onclick = () => this.toggle(true);
    this.miniQr = this.mini.querySelector('img')!;
    this.miniUrl = this.mini.querySelector('span')!;

    document.body.append(this.el, this.mini);
    this.paint();
  }

  toggle(force?: boolean) {
    this.open = force ?? !this.open;
    this.paint();
  }

  update(s: HostState) {
    this.phase = s.phase;
    this.updateCard(s);
    if (s.joinUrl !== this.url) {
      this.url = s.joinUrl;
      this.miniQr.src = qrSrc(s.joinUrl);
      this.miniUrl.textContent = s.joinUrl.replace(/^https?:\/\//, '');
    }
    // The lobby already shows the full card.
    if (s.phase === 'lobby' && this.open) this.open = false;
    this.paint();
  }

  private paint() {
    this.el.hidden = !this.open;
    this.pinBtn.textContent = this.pinned ? '📌 Bỏ ghim mã QR ở góc màn hình' : '📌 Ghim mã QR nhỏ ở góc màn hình';
    this.mini.hidden = !this.pinned || this.open || this.phase === 'lobby';
  }
}
