# Ka-tok — Mô tả chi tiết cách game hoạt động (tài liệu cho AI)

> Tài liệu này mô tả **trạng thái hiện tại của mã nguồn** (phiên bản `1.1.0` trong `package.json`, ngày 2026-11-08) để AI/lập trình viên đọc lại nhanh trước khi sửa code.
> Khi sửa hành vi game, hãy cập nhật file này cho khớp.
>
> Nguồn gốc: prompt ban đầu ở `ideas/Mo-ta-katok.txt`; các ghi chú điều chỉnh/ý tưởng tiếp theo ở `ideas/Dieu-chinh-game-v1.txt`; yêu cầu soạn bộ câu hỏi ở `ideas/Yeu-cau-cau-hoi.txt`. Hướng dẫn cho người dùng cuối nằm ở `README.md`.

---

## 1. Tổng quan

- **Ka-tok** là game đố vui kiểu Kahoot kết hợp **đua ngựa**, chạy **local** trên một máy (host) cho sự kiện onsite (hội trường).
- 3 trang web:
  - `/` (`public/index.html`): trang chọn **Người chơi** hoặc **Host**.
  - `/host` (`public/host.html`): màn hình chiếu lên máy chiếu, cần mật khẩu. Hiện câu hỏi, đáp án, đồng hồ, đường đua, bảng điểm, bục trao giải.
  - `/play` (`public/play.html`): màn hình điện thoại người chơi, chỉ có 2–4 nút hình/chữ cái lớn (A ▲, B ◆, C ●, D ■).
- Mỗi người chơi là **một con ngựa trên một làn đua vô hạn**; điểm càng cao ngựa càng xa (1 điểm = 1 đơn vị). Camera tự co giãn để thấy cả con đầu lẫn con cuối.
- Có thể chơi **theo đội** (tối đa 3 người/đội, điểm đội = trung bình điểm thành viên).
- Có màn hình **chấm điểm thủ công** làm phương án dự phòng.

## 2. Công nghệ & build

| Thành phần | Công nghệ |
|---|---|
| Server | Node.js ≥ 22.13, Express 5, Socket.IO 4, `node:sqlite` (SQLite tích hợp), `qrcode` (tạo QR SVG) |
| Client | HTML/CSS/TypeScript thuần, không framework; `socket.io-client` |
| Font | `@fontsource-variable/baloo-2`, phục vụ offline qua `/fonts/baloo` |
| Âm thanh | Tự tổng hợp bằng Web Audio (`src/client/common/sound.ts`), không có file âm thanh |
| Build | `build.mjs` dùng esbuild: client → `public/js/{landing,host,player}.js` (ESM), server → `dist/server.js` (CJS) |

Lệnh (`package.json`):
- `npm start` = build rồi chạy `dist/server.js`.
- `npm run dev` = `node build.mjs --watch` (rebuild + tự restart server). Cấu hình preview trong `.claude/launch.json` tên `katok-dev`, cổng 3000.
- `npm run typecheck` = `tsc --noEmit`.
- `npm run bots -- <số lượng> <url>` = người chơi ảo (`scripts/bots.mjs`; mặc định **18** bot, README ghi 8 — không khớp).
- `start.bat` (Windows): tự `npm install` nếu chưa có `node_modules`, rồi `npm start`.

> `public/js/*` và `dist/*` là file sinh ra, **không sửa tay**; sửa trong `src/`.

## 3. Cấu trúc thư mục

```
Katok/
├── config.json              # cấu hình (port, mật khẩu, tính điểm…)
├── questions/*.json         # mỗi file = 1 bộ câu hỏi; ảnh đặt trong questions/ (phục vụ qua /media)
├── data/ka-tok.sqlite       # DB SQLite (tự tạo) + snapshot ván đang chơi
├── data/results/*.csv       # CSV kết quả tự lưu mỗi khi ván kết thúc
├── public/                  # HTML, CSS, favicon; public/js do build sinh ra
├── scripts/bots.mjs         # bot diễn tập
├── build.mjs
└── src/
    ├── shared/types.ts      # kiểu dữ liệu + hằng số dùng chung server/client
    ├── server/
    │   ├── index.ts         # Express + Socket.IO, xác thực host, API QR/CSV, gom broadcast
    │   ├── game.ts          # class Game: máy trạng thái, người chơi, đội, tính điểm, snapshot
    │   ├── scoring.ts       # công thức điểm
    │   ├── questions.ts     # đọc/kiểm tra/xáo trộn bộ câu hỏi
    │   ├── db.ts            # lớp Db bọc SQLite
    │   ├── config.ts        # loadConfig() + giá trị mặc định
    │   └── net.ts           # liệt kê IP LAN, ưu tiên mạng thật (192.168.x > 10.x > 172.16-31.x, trừ VPN/ảo)
    └── client/
        ├── landing.ts       # trang chủ (chỉ trang trí ngựa)
        ├── common/          # dom.ts (helper, toast, countTo), net.ts (socket, call có timeout, banner mất kết nối),
        │                    # horse.ts (SVG ngựa theo màu), shapes.ts (4 hình đáp án + màu), sound.ts
        ├── host/            # main.ts (điều phối), views.ts (các màn hình), race.ts (đường đua),
        │                    # manual.ts (chấm tay), confetti.ts
        └── player/main.ts   # toàn bộ màn hình điện thoại
```

## 4. Cấu hình (`src/server/config.ts`, `config.json`)

| Khóa | Mặc định | Ý nghĩa |
|---|---|---|
| `port` | 3000 | Cổng server (env `PORT` ghi đè) |
| `hostPassword` | `katok2026` | Mật khẩu host (env `HOST_PASSWORD`) |
| `publicUrl` | `""` | URL cố định đưa lên đầu danh sách link tham gia/QR (env `PUBLIC_URL`) |
| `latencyCompensationMs` | 800 | Biên độ tin đồng hồ điện thoại khi tính thời gian trả lời |
| `autoEndWhenAllAnswered` | true | Tự kết thúc câu khi mọi người chơi online (không tính người chấm tay) đã trả lời |
| `maxPlayers` | 150 (config.json hiện đặt 180) | Số người tối đa |
| `scoring.maxPoints/minPoints` | 1000/500 | Điểm đúng ngay lập tức / đúng ở giây cuối |
| `scoring.wrongPoints/noAnswerPoints` | 0/0 | Điểm khi sai / không trả lời |
| `scoring.speedBonus` | [300,200,100] | Thưởng cho người đúng nhanh nhất, nhì, ba… |

`config.json` được merge nông với mặc định (riêng `scoring` merge 1 cấp). Đổi config cần restart server.

## 5. Bộ câu hỏi (`src/server/questions.ts`)

- Mỗi file `.json` trong `questions/` là một bộ, `id` = tên file bỏ `.json`. Đọc khi khởi động và khi host bấm **⟳ Tải lại** (BOM UTF-8 được bỏ).
- Định dạng:
  ```json
  {
    "title": "…",
    "defaults": { "time": 20, "readTime": 3, "points": 1 },
    "shuffleQuestions": false,
    "shuffleAnswers": false,
    "questions": [
      { "question": "…", "answers": ["…","…"], "correct": "A", "time": 15, "readTime": 4, "points": 2, "image": "images/x.png" }
    ]
  }
  ```
- Kiểm tra: `question` bắt buộc; `answers` 2–4 phần tử; `correct` là chữ `A–D`, số `0–3` hoặc mảng (nhiều đáp án đúng), được chuẩn hóa thành `number[]`. Câu lỗi bị **bỏ qua** và lỗi được liệt kê (hiện màu đỏ ở sảnh). `time` tối thiểu 3 giây. Số âm/không hợp lệ → dùng mặc định.
- `points` là **hệ số nhân** (0 = câu khởi động không tính điểm, 2 = nhân đôi).
- `image` là đường dẫn tương đối trong `questions/`, client tải qua `/media/<path>`.
- `prepareQuestions()` xáo câu hỏi/đáp án **mỗi ván** khi bật cờ (đáp án đúng được ánh xạ lại).
- Khi khởi động, bộ đầu tiên có câu hỏi hợp lệ được chọn mặc định.

## 6. Mô hình dữ liệu (server, `game.ts`)

- `Player { id, token, name, color (chỉ số 0–15 trong PLAYER_COLORS), score, socketId|null, manual, teamId|null }`
  - `token` (32 hex) lưu ở `localStorage` điện thoại để **tự vào lại** sau khi mất kết nối/tải lại trang.
  - `manual = true` khi host thêm người chơi không có điện thoại.
- `Team { id, name (≤12 ký tự), color }` — `MAX_TEAM_SIZE = 3` (`shared/types.ts`).
- `answers: Map<playerId, { choice, timeMs, at }>` — chỉ cho câu hiện tại.
- `round: RoundResult` — kết quả câu vừa xong (đáp án đúng, số người chọn từng đáp án, từng dòng `RoundRow`).
- `adjustments` — lịch sử chỉnh điểm tay (giữ tối đa 200, gửi host 50 mục gần nhất).
- `gameId` — id ngẫu nhiên mỗi ván (dùng cho DB/CSV).
- Tên người chơi: gộp khoảng trắng, cắt 20 ký tự, **không trùng** (so sánh không phân biệt hoa thường theo locale `vi`).
- Màu: người không có đội được gán màu ít người dùng nhất (tránh màu của đội); người trong đội **mang màu đội**. Người chơi lẻ có thể bấm "Đổi màu ngựa" ở sảnh.

## 7. Máy trạng thái (luồng game)

```
lobby → getready → question → reveal → race → leaderboard ─┬→ getready (câu tiếp)
                                                            └→ teamfinal (nếu có đội có thành viên) → final
                                                            └→ final (không có đội)
```

| Phase | Vào bằng | Kết thúc bằng | Ghi chú |
|---|---|---|---|
| `lobby` | khởi động / `newGame` / `toLobby` | host `start`/`next` | Chọn bộ câu hỏi, tạo đội, người chơi vào phòng |
| `getready` | `getReady(i)` nếu `readTime > 0` | hết `readTime` hoặc host `next` (bỏ qua) | Chỉ hiện câu hỏi để đọc, chưa hiện đáp án cho người chơi |
| `question` | `openQuestion()` | hết `time` + 300 ms grace, host `next` (Dừng), hoặc mọi người online đã trả lời | Nhận `player:answer` |
| `reveal` | `endQuestion()` | host `next` | Tính điểm, ghi DB, hiện đáp án đúng + biểu đồ + top 3 nhanh nhất |
| `race` | host `next` hoặc `goto('race')` | host `next` | Ngựa chạy theo điểm vừa cộng |
| `leaderboard` | host `next` hoặc `goto('leaderboard')` | host `next` | Bảng chi tiết; `next` sang câu tiếp hoặc `finish()` nếu là câu cuối |
| `teamfinal` | `finish()` khi có ≥1 đội có thành viên | host `next` | Bục top 3 đội |
| `final` | `finish()` hoặc `next` từ `teamfinal` | `newGame` / `toLobby` | Bục top 3 cá nhân, danh sách hạng 4–15, nút xuất CSV |

- Hẹn giờ ở server bằng `setTimeout` + `performance.now()` (`startTimed`). `remainingMs` được gửi kèm mỗi state để client tự đếm ngược.
- `goto(race|leaderboard)` cho phép chuyển qua lại giữa đường đua và bảng điểm bất cứ lúc nào **trừ** khi đang `getready`/`question`.
- `end()` (menu ☰ "Kết thúc game"): nếu đang `question` thì chốt câu đó trước, rồi `finish()`.
- `finish()`: ghi `results` vào DB, đánh dấu `ended_at`, **tự lưu CSV** vào `data/results/ka-tok-<YYYY-MM-DD_HH-mm>-<gameId>.csv`.
- `reset(keepPlayers)`: `newGame` giữ người chơi và đội, điểm về 0, gameId mới; `toLobby` còn đá (kick) toàn bộ người chơi. Đội luôn được giữ.
- Đội chỉ tạo/xóa/đổi thành viên được khi **chưa bắt đầu** (`!started`); đổi tên/màu đội thì lúc nào cũng được.

## 8. Trả lời & tính thời gian (`Game.answer`)

1. Từ chối nếu không ở `question`, đã trả lời rồi, hoặc `choice` ngoài phạm vi. **Mỗi người chỉ trả lời 1 lần**, không đổi được.
2. `serverElapsed = now − phaseStart`; quá `time + 300ms` → "Hết giờ rồi!".
3. Client gửi `elapsed` = thời gian từ lúc điện thoại nhận phase `question` tới lúc bấm. Server dùng:
   `timeMs = clamp(clientElapsed, serverElapsed − latencyCompensationMs, serverElapsed)`, rồi kẹp vào `[0, time]`.
   → Bù trễ mạng cho người dùng 4G nhưng không cho phép khai thời gian quá nhỏ.
4. Ghi vào `answers`, báo host (feed) và riêng người chơi đó; kiểm tra tự kết thúc.

## 9. Tính điểm (`src/server/scoring.ts`, gọi trong `endQuestion`)

```
Không trả lời: noAnswerPoints × points
Sai:           wrongPoints × points
Đúng:          round( (minPoints + (maxPoints − minPoints) × (1 − timeMs/limitMs) + speedBonus[hạng_tốc_độ]) × points )
```
- `hạng_tốc_độ` = thứ tự trong danh sách người trả lời **đúng**, sắp theo `timeMs` rồi theo thời điểm server nhận (`at`).
- Câu có nhiều đáp án đúng: chọn **một** trong các đáp án đúng là đúng.
- Người chấm tay (manual) không trả lời được → nhận `noAnswerPoints`.
- **Hạng** = xếp hạng thi đấu (đồng điểm cùng hạng: `1 + số người điểm cao hơn`).
- `prevRank` chỉ được tính khi trước câu đó điểm không đồng đều (tránh mũi tên vô nghĩa ở câu 1).
- `RoundRow.fastest` = người đúng nhanh nhất (hiện ⚡).
- **Điểm đội** = trung bình cộng điểm thành viên (`teamStats`), hạng đội chỉ tính các đội có thành viên.

## 10. Giao thức Socket.IO

Server phát (server → client):
| Sự kiện | Gửi tới | Nội dung |
|---|---|---|
| `host:state` | room `hosts` | `HostState` đầy đủ (xem `shared/types.ts`) |
| `player:state` | socket của từng người chơi | `PlayerState` riêng của người đó (hoặc `null`) |
| `teams` | mọi socket không phải host (và mỗi socket khi vừa kết nối) | `TeamOption[]` — rỗng khi game đã bắt đầu |
| `player:kicked` | socket bị mời ra | — |

Client gửi (đều có ack `{ ok, error? }`):
| Sự kiện | Ai | Payload |
|---|---|---|
| `host:auth` | host | `{ password }` hoặc `{ token }` → ack có `token` |
| `host:action` | host đã auth | `HostAction`: `start, next, goto, end, newGame, toLobby, selectSet, reloadQuestions, selectUrl, kick, rename, addPlayer, adjust, setScore, createTeam, updateTeam, deleteTeam, setTeam` |
| `player:join` | người chơi | `{ name?, token?, teamId? }` → ack có `token`; lỗi `unknown-token` nếu token cũ không còn |
| `player:answer` | người chơi | `{ choice, elapsed }` |
| `player:color` | người chơi | đổi màu ngựa (chỉ khi không có đội) |
| `player:team` | người chơi | `{ teamId }` đổi đội ở sảnh |

- **Gom broadcast** (`index.ts → scheduleFlush`): mọi thay đổi chỉ đánh dấu "pending", rồi `setImmediate` phát **một lần mỗi tick**: `host:state` cho host, `player:state` cho từng người (tất cả, hoặc chỉ những người bị ảnh hưởng), `teams` chỉ khi danh sách đội thay đổi. `Game.changed()` = lưu snapshot + `events.all()`.
- Server là **nguồn sự thật duy nhất**; client chỉ render state nhận được.
- Trong `HostState`, `correct` chỉ có từ phase `reveal` trở đi (không lộ đáp án sớm). `PlayerState` không bao giờ chứa nội dung câu hỏi, chỉ số lượng đáp án.

### Xác thực host
- `HOST_TOKEN = sha256(secret + ":" + hostPassword)`, `secret` ngẫu nhiên lưu trong bảng `kv` → token sống qua restart, mất hiệu lực khi đổi mật khẩu.
- Client host lưu token trong `sessionStorage` (`katok-host-token`), tự đăng nhập lại khi socket kết nối lại. Nhiều màn hình host có thể mở cùng lúc, luôn đồng bộ.

### HTTP API
- `GET /api/qr?text=...` → SVG mã QR (≤500 ký tự).
- `GET /api/export.csv?token=HOST_TOKEN` → CSV ván hiện tại (có BOM để Excel đọc tiếng Việt).
- Static: `public/` (có `extensions: ['html']` nên `/host`, `/play` chạy được), `/fonts/baloo`, `/media` → `questions/`.

## 11. Link tham gia & QR

- Khi `listen`, `joinUrls` = `[publicUrl?] + http://<từng IP LAN>:port + http://localhost:port`; `joinUrl` mặc định là phần tử đầu.
- Server lắng nghe `0.0.0.0`.
- Ở sảnh host có ô chọn URL (danh sách trên + "✎ Nhập địa chỉ khác…" — cho dán link tunnel, ví dụ `cloudflared tunnel --url http://localhost:3000`). Action `selectUrl` chấp nhận mọi URL `http(s)://`, thêm vào đầu danh sách, QR cập nhật.
- QR + link **chỉ hiển thị ở màn hình sảnh** (`lobbyView`), không có ở các màn hình khác trong lúc chơi.
- `joinUrls`/`joinUrl` không nằm trong snapshot (tính lại mỗi lần khởi động; URL tự nhập sẽ mất khi restart).

## 12. Giao diện Host (`src/client/host/`)

`main.ts`:
- Đăng nhập → nhận `host:state` → `render()`. Mỗi màn hình là một `View { update(s), destroy?() }`; view chỉ được **tạo lại** khi `keyFor(state)` đổi (`question` và `reveal` dùng chung một view `q-<index>` để chuyển cảnh mượt), còn lại gọi `update`.
- Âm thanh theo phase: `getready` → `start`; `question` → nhạc nền (dừng khi rời phase); `reveal` → `ring` (reng) rồi `reveal`; `leaderboard` → `pop`; `teamfinal/final` → `fanfare` + pháo giấy. Trình duyệt chỉ cho phát tiếng sau thao tác đầu tiên (`unlockAudio`).
- Nút lớn góc dưới phải (`#next`) đổi nhãn theo phase: Bắt đầu ▶ / Hiện đáp án ⏭ / Dừng ⏹ / Đường đua 🏇 / Bảng điểm 📋 / Câu tiếp ▶ (câu cuối: "Kết quả chung cuộc 🏆") / Bục cá nhân 🏅. Phím tắt: **Space/Enter/→** = next, **M** = chấm tay, **F** = toàn màn hình, **Esc** đóng chấm tay.
- Thanh trên: tên bộ câu hỏi, "Câu x/y", 👥 online/tổng; nút 🏇/📋 (chuyển nhanh), ✍️, 🔊, ⛶, menu ☰ (Kết thúc game, Ván mới, Về sảnh & xoá người chơi, Xuất CSV, Tải lại câu hỏi, Đăng xuất). Thao tác nguy hiểm có `confirm()`.
- Bắt đầu khi chưa có ai → hỏi xác nhận.

`views.ts`:
- **lobbyView**: thẻ tham gia (URL, QR, ô chọn URL); chọn bộ câu hỏi + ⟳ Tải lại + danh sách lỗi (tối đa 6); form tạo đội (tên + ô màu, màu đã dùng bị khóa); thẻ đội (bấm tên → đổi tên, chấm màu → xoay sang màu trống kế tiếp, ✕ → xóa, bấm thành viên → mời ra); bong bóng người chơi lẻ (bấm → mời ra), người mất kết nối hiện mờ; tiếng `pop` khi có người mới.
- **getReadyView**: số câu, nhãn hệ số (×N ĐIỂM / "Câu khởi động"), câu hỏi chữ lớn, thanh chạy theo `readTime`.
- **questionView**: câu hỏi, đồng hồ vòng tròn (tích tắc 5 giây cuối, gấp hơn 3 giây cuối), ảnh minh họa (hoặc ngựa chạy), số người đã trả lời, dải "feed" tên + thời gian người vừa trả lời (tối đa 30 chip), 2–4 ô đáp án màu/hình. Khi sang `reveal`: đánh dấu ✔/✘ trên ô, thay ảnh bằng biểu đồ cột số người chọn từng đáp án + top 3 đúng nhanh nhất (hoặc "Không ai trả lời đúng 😅").
- **raceView**: gắn `RaceTrack` dùng chung; tiêu đề "sau câu x/y".
- **boardView**: nếu có `round`: cột *Thứ tự (kèm ▲/▼ đổi hạng), Người chơi (⚡ nếu nhanh nhất), Đáp án (hình + ✔/✘), Thời gian, Điểm lượt này, Tổng điểm*; top 3 được tô nổi. Nếu không có `round` (ví dụ sau khi khôi phục): chỉ *Thứ tự, Người chơi, Tổng điểm*. Hiển thị **tất cả** người chơi trong bảng có cuộn.
- **teamFinalView**: bục 2-1-3 cho đội (ngựa của từng thành viên, tên thành viên, điểm TB), danh sách đội hạng 4–15.
- **finalView**: bục 2-1-3 cá nhân, danh sách hạng 4–15, nút Xuất CSV / Ván mới / Về sảnh.

`race.ts` (`RaceTrack`):
- Mỗi người chơi một làn (`.race-row`): nhãn trái (tên đội ở làn đầu nhóm, hạng, tên, điểm chạy số) + làn có ngựa SVG và 👑 cho người dẫn đầu.
- Thứ tự làn: các đội theo thứ tự tạo (thành viên nằm sát nhau, có viền nhóm), rồi người chơi lẻ theo thứ tự vào phòng. **Làn không sắp theo hạng.**
- Ở `lobby/getready/question`, track được cập nhật **không animation** (giữ vị trí cũ). Ở `race`, ngựa phi từ `score − gained` tới `score` trong 3,4 s (easeInOut, mỗi con trễ ngẫu nhiên ≤280 ms), hiện "+điểm", tiếng vó ngựa.
- Camera: khoảng hiển thị `[camMin, camMax]` bao trọn mọi ngựa (cả vị trí đích), tối thiểu 1500 điểm, nội suy mượt; vạch mốc "XUẤT PHÁT"/mốc điểm tròn tự chọn bước; mặt đất cuộn theo camera.
- Chiều cao làn chia đều theo flexbox, có chiều cao tối thiểu rồi cuộn dọc khi quá nhiều người.

`manual.ts` (modal ✍️ Chấm điểm thủ công, mở được ở mọi phase):
- Thêm người chơi không cần điện thoại (`addPlayer`, biểu tượng ✍️).
- Bảng xếp theo điểm: nút nhanh −100/+100/+500; ô **Điểm lượt** (nhập nháp nhiều người, "Điền nhanh vào ô trống", "Xoá ô nhập"); ô **Đặt tổng** (`setScore` → thực chất là `adjust` với delta); đổi tên ✎; xóa 🗑; chọn đội (chỉ ở sảnh).
- Ghi chú (reason) + **✔ Áp dụng** hoặc **🏇 Áp dụng & chạy đua** (chuyển sang phase `race` nếu không đang ở getready/question).
- Mọi chỉnh sửa vào `adjustments` + bảng `adjustments` trong DB; hiển thị ở "Lịch sử chỉnh điểm".

## 13. Giao diện Người chơi (`src/client/player/main.ts`)

- **Màn vào phòng**: nhập tên (nhớ trong `localStorage` `katok-player-name`); nếu còn đội trống thì **bắt buộc chọn đội** (nút đội hiện số người x/3, đội đủ bị khóa). Lỗi hiện đỏ + rung thẻ.
- Tự vào lại: khi socket kết nối, nếu có `katok-player-token` thì `player:join` bằng token. Giữ màn hình sáng bằng Wake Lock.
- Thanh trên: ngựa, tên, đội, tổng điểm. Màu chủ đạo theo màu ngựa/đội.
- Theo phase:
  - `lobby`: "Bạn đã vào rồi!", chọn/đổi đội hoặc "🎨 Đổi màu ngựa".
  - `getready`: "Chuẩn bị…" + đếm ngược, "Đọc câu hỏi trên màn hình lớn!".
  - `question`: 2–4 nút lớn (hình + chữ), đồng hồ; bấm (`pointerdown`) → rung 35 ms, hiện "Đã chọn!" + thời gian ngay (lạc quan), nếu server từ chối thì toast lỗi và hiện lại nút.
  - `reveal/race/leaderboard`: Chính xác!/Sai rồi!/Hết giờ!, thời gian, điểm vừa cộng, đáp án đúng (nếu sai), hạng hiện tại; âm + rung chỉ phát một lần ở `reveal`. Nếu không có kết quả (vào giữa chừng): "Chờ câu tiếp theo…".
  - `teamfinal`: hạng & điểm đội (người không có đội: "Đang công bố kết quả đội…").
  - `final`: huy chương, hạng / tổng, điểm, hạng đội.
- Bị kick: xóa token, màn "Bạn đã rời phòng" + nút "Vào lại".
- Người chơi **có thể vào giữa ván** (không bị chặn sau khi bắt đầu, nhưng không chọn đội được nữa).

## 14. Lưu trữ & khôi phục (`db.ts`, `Game.persist/restore`)

Bảng SQLite (`data/ka-tok.sqlite`, WAL):
- `games(id, set_id, set_title, started_at, ended_at)`
- `answers(game_id, question_index, question_text, player_id, player_name, choice, time_ms, correct, points, created_at)` — một dòng / người / câu (kể cả không trả lời).
- `adjustments(game_id, player_id, player_name, delta, reason, created_at)`
- `results(game_id, player_id, player_name, score, rank)`
- `kv(key, value)` — `secret` (cho token host) và `snapshot`.

Snapshot (`v: 1`) được ghi **mỗi lần `changed()`**: gameId, started, setId, danh sách câu đã chuẩn bị, qIndex, phase, players (bỏ socketId), teams, round, adjustments.
Khi khởi động `restore()`:
- Luôn khôi phục đội.
- Nếu có người chơi hoặc ván đã bắt đầu: khôi phục toàn bộ; nếu đang `getready/question` thì lùi `qIndex` 1, xóa `round`, đặt phase `leaderboard` (hoặc `lobby` nếu chưa bắt đầu) → bấm next sẽ **hỏi lại câu bị gián đoạn**.
- Cờ `restored` → host đầu tiên kết nối thấy toast "♻️ Đã khôi phục…".
- Người chơi tự vào lại bằng token.

CSV (`exportRows`): cột *Hạng, Người chơi, [Đội], Câu 1..N (điểm từng câu), Chấm tay, Tổng điểm*; nếu có đội thêm bảng *Hạng đội, Đội, Thành viên, Điểm đội (trung bình)*.

## 15. Những điểm cần lưu ý / hạn chế đã quan sát

- **Toast** (`public/css/base.css` `.toast`, `dom.ts → toast`): ẩn bằng `transform: translate(-50%, 140%)` từ `bottom: 28px`, không có `opacity/visibility` — khi ẩn nó trượt xuống đáy màn hình thay vì biến mất hẳn (khớp với bug "thông báo chạy xuống cuối màn hình mà không biến mất" ghi trong `ideas/Dieu-chinh-game-v1.txt`).
- Tham gia bằng link tự nhập: `selectUrl` chỉ đổi URL hiển thị/QR, không đổi gì ở server. Bug "không vào được bằng link tự tạo, phải dùng cloudflare tunnel" được ghi trong `ideas/Dieu-chinh-game-v1.txt`, **chưa xác định nguyên nhân**.
- Đông người (>100): đường đua 1 làn/người và bảng kết quả hiển thị tất cả → khó đọc trên màn hình lớn (vấn đề #1 trong `ideas/Dieu-chinh-game-v1.txt`).
- Kết thúc chỉ có bục top 3 đội + top 3 cá nhân (vấn đề #2 — muốn thêm các màn "Trao giải").
- QR/link chỉ ở sảnh (vấn đề #3 — muốn hiện trong lúc chơi).
- `MAX_TEAM_SIZE = 3` là hằng số cứng trong `shared/types.ts` (bot cũng giả định 3).
- Một số thao tác (rename, kick, adjust) không lọc theo phase — host có thể làm bất cứ lúc nào.
- `scripts/bots.mjs` mặc định 18 bot với tên kiểu `A1 - 1 🤖` và tự xếp 3 bot/đội; README nói mặc định 8.
- Phiên bản hiện tại: `package.json` `"version": "1.0.0"`.

## 16. Bản đồ "muốn sửa X thì vào đâu"

| Muốn thay đổi | File |
|---|---|
| Công thức điểm | `src/server/scoring.ts` (+ `config.json → scoring`) |
| Luồng phase, điều kiện chuyển, đội, kick, chấm tay | `src/server/game.ts` |
| Kiểu state gửi client / thêm action mới | `src/shared/types.ts` + `game.ts` (hostState/playerState) + `index.ts` (switch `host:action`) |
| Đọc/kiểm tra file câu hỏi | `src/server/questions.ts` |
| Màn hình host từng phase | `src/client/host/views.ts` (+ `public/css/host.css`) |
| Nút next, phím tắt, menu, âm thanh theo phase | `src/client/host/main.ts`, `public/host.html` |
| Đường đua | `src/client/host/race.ts` |
| Màn chấm tay | `src/client/host/manual.ts` |
| Điện thoại người chơi | `src/client/player/main.ts`, `public/play.html`, `public/css/player.css` |
| Toast, banner mất kết nối, helper chung | `src/client/common/dom.ts`, `common/net.ts`, `public/css/base.css` |
| Âm thanh | `src/client/common/sound.ts` |
| DB / CSV | `src/server/db.ts`, `game.ts → exportRows`, `index.ts → toCsv` |
| IP/URL tham gia | `src/server/net.ts`, `index.ts` (listen, `selectUrl`) |
