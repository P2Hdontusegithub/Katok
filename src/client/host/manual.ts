// Manual scoring screen – backup when phones/network fail, or for corrections.
import type { HostState } from '../../shared/types';
import { MAX_TEAM_SIZE } from '../../shared/types';
import { esc, fmtPoints, toast } from '../common/dom';
import { playerColor } from '../common/horse';
import type { Ctx } from './views';

export class ManualPanel {
  private el: HTMLElement;
  private body: HTMLElement;
  private log: HTMLElement;
  private state: HostState | null = null;
  private drafts = new Map<string, string>();
  private sig = '';
  open = false;

  constructor(private ctx: Ctx) {
    this.el = document.createElement('div');
    this.el.className = 'modal manual';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="modal-card">
        <header class="modal-head">
          <h2>✍️ Chấm điểm thủ công</h2>
          <button class="icon-btn close" title="Đóng (Esc)">✕</button>
        </header>
        <p class="manual-help">Nhập điểm cộng (hoặc trừ, ví dụ <b>-200</b>) vào cột <b>“Điểm lượt”</b> cho từng người rồi bấm <b>Áp dụng</b>. Dùng khi mạng/điện thoại gặp sự cố, hoặc để sửa điểm.</p>
        <div class="manual-tools">
          <form class="add-form">
            <input name="name" maxlength="20" placeholder="Thêm người chơi (không cần điện thoại)…" autocomplete="off" />
            <button class="btn small">＋ Thêm</button>
          </form>
          <div class="quick">
            <span>Điền nhanh:</span>
            <input class="quick-val" type="number" value="1000" step="100" />
            <button class="btn small ghost quick-fill" title="Điền giá trị này cho những ô đang trống">vào ô trống</button>
            <button class="btn small ghost quick-clear">Xoá ô nhập</button>
          </div>
        </div>
        <div class="manual-table-wrap">
          <table class="manual-table">
            <thead><tr><th>#</th><th>Người chơi</th><th>Tổng hiện tại</th><th>Nhanh</th><th>Điểm lượt</th><th>Đặt tổng</th><th></th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
        <footer class="modal-foot">
          <input class="reason" maxlength="80" placeholder="Ghi chú (vd: Câu hỏi phụ 1)" />
          <button class="btn ghost apply">✔ Áp dụng</button>
          <button class="btn apply-race">🏇 Áp dụng & chạy đua</button>
        </footer>
        <details class="adj-log"><summary>Lịch sử chỉnh điểm</summary><ul></ul></details>
      </div>`;
    document.body.appendChild(this.el);
    this.body = this.el.querySelector('tbody')!;
    this.log = this.el.querySelector('.adj-log ul')!;

    this.el.querySelector<HTMLElement>('.close')!.onclick = () => this.toggle(false);
    this.el.onclick = (e) => {
      if (e.target === this.el) this.toggle(false);
    };
    this.el.querySelector<HTMLFormElement>('.add-form')!.onsubmit = async (e) => {
      e.preventDefault();
      const input = (e.target as HTMLFormElement).elements.namedItem('name') as HTMLInputElement;
      if (await this.ctx.send({ type: 'addPlayer', name: input.value })) input.value = '';
    };
    this.el.querySelector<HTMLElement>('.quick-fill')!.onclick = () => {
      const v = this.el.querySelector<HTMLInputElement>('.quick-val')!.value;
      this.body.querySelectorAll<HTMLInputElement>('.delta').forEach((i) => {
        if (!i.value) {
          i.value = v;
          this.drafts.set(i.dataset.id!, v);
        }
      });
    };
    this.el.querySelector<HTMLElement>('.quick-clear')!.onclick = () => this.clearDrafts();
    this.el.querySelector<HTMLElement>('.apply')!.onclick = () => this.apply(false);
    this.el.querySelector<HTMLElement>('.apply-race')!.onclick = () => this.apply(true);

    this.body.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.classList.contains('delta')) this.drafts.set(t.dataset.id!, t.value);
    });
    this.body.addEventListener('change', (e) => {
      const t = e.target as HTMLSelectElement;
      if (!t.classList.contains('team-sel')) return;
      const id = t.closest<HTMLElement>('tr')!.dataset.id!;
      this.ctx.send({ type: 'setTeam', playerId: id, teamId: t.value || null }).then((ok) => {
        if (!ok) this.toggle(true); // re-render to undo the selection
      });
    });
    this.body.addEventListener('click', async (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!btn) return;
      const id = btn.closest<HTMLElement>('tr')!.dataset.id!;
      const name = this.state?.players.find((p) => p.id === id)?.name ?? '';
      if (btn.dataset.q) {
        await this.ctx.send({ type: 'adjust', changes: [{ playerId: id, delta: Number(btn.dataset.q) }], reason: this.reason() });
      } else if (btn.classList.contains('set')) {
        const input = btn.previousElementSibling as HTMLInputElement;
        if (input.value !== '') await this.ctx.send({ type: 'setScore', playerId: id, score: Number(input.value) });
      } else if (btn.classList.contains('rename')) {
        const n = prompt('Tên mới:', name);
        if (n) await this.ctx.send({ type: 'rename', playerId: id, name: n });
      } else if (btn.classList.contains('kick')) {
        if (confirm(`Xoá "${name}" khỏi trò chơi?`)) await this.ctx.send({ type: 'kick', playerId: id });
      }
    });
    this.body.addEventListener('keydown', (e) => {
      const t = e.target as HTMLInputElement;
      if (e.key === 'Enter' && t.classList.contains('set-val')) (t.nextElementSibling as HTMLElement).click();
    });
  }

  private reason() {
    return this.el.querySelector<HTMLInputElement>('.reason')!.value;
  }

  private clearDrafts() {
    this.drafts.clear();
    this.body.querySelectorAll<HTMLInputElement>('.delta').forEach((i) => (i.value = ''));
  }

  private async apply(showRace: boolean) {
    const changes = [...this.drafts.entries()]
      .map(([playerId, v]) => ({ playerId, delta: Number(v) }))
      .filter((c) => Number.isFinite(c.delta) && c.delta !== 0);
    if (!changes.length) return toast('Chưa nhập điểm nào.', 'error');
    const busy = this.state?.phase === 'question' || this.state?.phase === 'getready';
    if (await this.ctx.send({ type: 'adjust', changes, reason: this.reason(), showRace: showRace && !busy })) {
      toast(`Đã cập nhật điểm cho ${changes.length} người.`, 'ok');
      this.clearDrafts();
      if (showRace && !busy) this.toggle(false);
    }
  }

  toggle(open = !this.open) {
    this.open = open;
    this.el.hidden = !open;
    this.sig = '';
    if (open && this.state) this.update(this.state);
  }

  update(s: HostState) {
    this.state = s;
    if (!this.open) return;
    const sig = JSON.stringify([s.players, s.teams, s.phase === 'lobby', s.adjustments.length]);
    if (sig === this.sig) return;
    this.sig = sig;
    const focused = document.activeElement as HTMLInputElement | null;
    const focusKey = focused?.closest('.manual-table') ? `${focused.closest('tr')?.dataset.id}|${focused.className}` : null;
    const sorted = [...s.players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'vi'));
    // Teams can only be changed before the game starts.
    const teamCell = (p: (typeof sorted)[number]) => {
      if (!s.teams.length) return '';
      if (s.phase !== 'lobby') {
        const t = s.teams.find((x) => x.id === p.teamId);
        return t ? ` <small class="m-team">· ${esc(t.name)}</small>` : '';
      }
      const opts = s.teams.map((t) => `<option value="${t.id}" ${t.id === p.teamId ? 'selected' : ''}>${esc(t.name)} (${t.memberIds.length}/${MAX_TEAM_SIZE})</option>`);
      return ` <select class="team-sel" title="Đội"><option value="">— Không đội —</option>${opts.join('')}</select>`;
    };
    this.body.innerHTML =
      sorted
        .map((p, i) => {
          const rank = 1 + sorted.filter((o) => o.score > p.score).length;
          return `<tr data-id="${p.id}" style="--pc:${playerColor(p.color)}">
          <td>${rank || i + 1}</td>
          <td class="m-name"><i class="dot ${p.connected ? 'on' : p.manual ? 'manual' : 'off'}" title="${p.manual ? 'Chấm tay' : p.connected ? 'Đang kết nối' : 'Mất kết nối'}"></i>${esc(p.name)}${p.manual ? ' <small>✍️</small>' : ''}${teamCell(p)}</td>
          <td class="m-score">${fmtPoints(p.score)}</td>
          <td class="m-quick"><button data-q="-100">−100</button><button data-q="100">+100</button><button data-q="500">+500</button></td>
          <td><input class="delta" data-id="${p.id}" type="number" step="50" placeholder="0" value="${esc(this.drafts.get(p.id) ?? '')}" /></td>
          <td class="m-set"><input class="set-val" type="number" placeholder="${p.score}" /><button class="set" title="Đặt tổng điểm">Đặt</button></td>
          <td class="m-act"><button class="rename" title="Đổi tên">✎</button><button class="kick" title="Xoá">🗑</button></td>
        </tr>`;
        })
        .join('') || `<tr><td colspan="7" class="muted center">Chưa có người chơi. Thêm người chơi ở ô phía trên.</td></tr>`;
    if (focusKey) {
      const [id, cls] = focusKey.split('|');
      const el = this.body.querySelector<HTMLInputElement>(`tr[data-id="${id}"] input.${cls.split(' ')[0]}`);
      el?.focus();
    }
    this.log.innerHTML =
      s.adjustments
        .map((a) => `<li><b>${esc(a.name)}</b> <span class="${a.delta > 0 ? 'pos' : 'neg'}">${a.delta > 0 ? '+' : ''}${fmtPoints(a.delta)}</span> — ${esc(a.reason)} <small>${new Date(a.at).toLocaleTimeString('vi-VN')}</small></li>`)
        .join('') || '<li class="muted">Chưa có.</li>';
  }
}
