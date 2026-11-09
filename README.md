# 🏇 Ka-tok

Trò chơi đố vui kiểu Kahoot kết hợp **đua ngựa**, chạy **local** trên một máy tính để dùng cho sự kiện onsite.

- **Host** (máy tính nối máy chiếu) hiển thị câu hỏi, 4 đáp án, đồng hồ đếm ngược, đường đua và bảng xếp hạng.
- **Người chơi** mở trình duyệt trên điện thoại, không cần cài app, chỉ cần vào chung mạng với máy host.
- Mỗi người chơi là một con ngựa trên một làn đua vô hạn. Trả lời đúng và nhanh thì được nhiều điểm, ngựa chạy xa hơn. Camera tự co giãn để luôn thấy được cả con đầu lẫn con cuối.

---

## Mục lục

1. [Yêu cầu](#1-yêu-cầu)
2. [Cài đặt từng bước](#2-cài-đặt-từng-bước)
3. [Chạy trò chơi](#3-chạy-trò-chơi)
4. [Kết nối mạng cho người chơi (quan trọng)](#4-kết-nối-mạng-cho-người-chơi-quan-trọng)
5. [Cấu hình `config.json`](#5-cấu-hình-configjson)
6. [Soạn câu hỏi bằng JSON](#6-soạn-câu-hỏi-bằng-json)
7. [Điều khiển khi chơi (Host)](#7-điều-khiển-khi-chơi-host)
8. [Cách tính điểm](#8-cách-tính-điểm)
9. [Chấm điểm thủ công (dự phòng)](#9-chấm-điểm-thủ-công-dự-phòng)
10. [Dữ liệu, sao lưu và khôi phục](#10-dữ-liệu-sao-lưu-và-khôi-phục)
11. [Diễn tập với người chơi ảo (bot)](#11-diễn-tập-với-người-chơi-ảo-bot)
12. [Khắc phục sự cố](#12-khắc-phục-sự-cố)
13. [Checklist trước sự kiện](#13-checklist-trước-sự-kiện)
14. [Dành cho lập trình viên](#14-dành-cho-lập-trình-viên)

---

## 1. Yêu cầu

| Thứ cần có | Ghi chú |
|---|---|
| **Máy tính host** | Windows 10/11, macOS hoặc Linux. Máy này chạy server và nối với máy chiếu/TV. |
| **Node.js ≥ 22.13** | Nên dùng bản **LTS mới nhất** (22.x hoặc 24.x). Ka-tok dùng SQLite có sẵn trong Node, nên không cần cài thêm cơ sở dữ liệu nào. |
| **Mạng chung** | Wi-Fi/router của địa điểm, hoặc hotspot 4G. Xem [mục 4](#4-kết-nối-mạng-cho-người-chơi-quan-trọng). |
| **Điện thoại người chơi** | Trình duyệt bất kỳ, đời 2020 trở lên (Chrome, Safari, Zalo/Facebook in-app đều được). |

> Chỉ cần Internet **một lần** để cài đặt (`npm install`). Sau đó trò chơi chạy hoàn toàn offline: font chữ, mã QR, âm thanh đều nằm trong máy.

---

## 2. Cài đặt từng bước

### Bước 1: Cài Node.js

1. Vào <https://nodejs.org> và tải bản **LTS**.
2. Cài đặt, bấm *Next* liên tục với tùy chọn mặc định. Trên Windows, giữ nguyên tùy chọn *Add to PATH*.
3. Mở **Terminal** (macOS/Linux) hoặc **PowerShell / Command Prompt** (Windows) rồi kiểm tra:

   ```bash
   node -v
   ```

   Kết quả phải là `v22.13.0` hoặc mới hơn, ví dụ `v24.11.0`. Nếu báo *not recognized*, hãy khởi động lại máy rồi thử lại.

### Bước 2: Lấy mã nguồn

Sao chép cả thư mục `Katok` vào máy host (qua USB, Google Drive, `git clone`…). Nên để ở đường dẫn **không có dấu tiếng Việt và không có khoảng trắng**, ví dụ `D:\Katok` hoặc `~/Katok`.

### Bước 3: Cài thư viện

Mở terminal **trong thư mục Katok** và chạy:

```bash
npm install
```

> **Windows:** mở thư mục Katok trong File Explorer, gõ `cmd` vào thanh địa chỉ rồi nhấn Enter là có ngay cửa sổ lệnh đúng thư mục.

Bước này cần Internet và mất khoảng 30 giây đến 1 phút. Nếu thấy dòng cảnh báo `npm warn allow-scripts esbuild…` thì cứ bỏ qua, không ảnh hưởng gì.

### Bước 4: Đổi mật khẩu host

Mở file `config.json` bằng Notepad/VS Code và đổi `"hostPassword"`, vì mật khẩu mặc định là `katok2026`. Xem thêm các tùy chọn ở [mục 5](#5-cấu-hình-configjson).

---

## 3. Chạy trò chơi

**Cách 1 (Windows, dễ nhất):** nhấp đúp vào file **`start.bat`**. Lần đầu file này sẽ tự chạy `npm install`.

**Cách 2 (mọi hệ điều hành):**

```bash
npm start
```

Khi chạy thành công, cửa sổ sẽ hiện:

```
────────────────────────────────────────────────────────
  🏇  KA-TOK đã chạy!
────────────────────────────────────────────────────────
  Host (máy chiếu):   http://localhost:3000/host
  Mật khẩu host:      katok2026
  Người chơi vào:
     → http://192.168.1.23:3000
────────────────────────────────────────────────────────
```

1. Trên máy host, mở **Chrome/Edge** vào `http://localhost:3000/host`, nhập mật khẩu, rồi nhấn **F** (hoặc nút ⛶) để bật toàn màn hình trên máy chiếu.
2. Người chơi quét **mã QR** trên màn hình hoặc gõ địa chỉ `http://192.168.x.x:3000`, chọn **Người chơi**, nhập tên rồi bấm **Vào chơi!**
3. Muốn tắt server: bấm **Ctrl + C** trong cửa sổ terminal, hoặc đóng cửa sổ đó.

> **Âm thanh:** trình duyệt chỉ cho phát tiếng sau khi bạn bấm vào trang. Hãy bấm vào trang host một lần (ví dụ nút Bắt đầu) trước khi chơi. Nút 🔊/🔇 ở góc trên dùng để bật/tắt tiếng.

---

## 4. Kết nối mạng cho người chơi (quan trọng)

Điện thoại người chơi phải **truy cập được tới máy host**. Có 3 cách:

### Cách A: Wi-Fi chung (khuyên dùng)

Máy host và mọi điện thoại cùng vào **một mạng Wi-Fi**. Người chơi mở địa chỉ `http://<IP-máy-host>:3000` (chính là địa chỉ hiện trên màn hình và trong mã QR).

⚠️ Một số Wi-Fi "khách" (guest) ở khách sạn hoặc quán cà phê bật **AP/Client Isolation**, tức là chặn các thiết bị nhìn thấy nhau. Nếu điện thoại không vào được dù chung Wi-Fi, hãy dùng cách B.

### Cách B: Phát hotspot

- **Điện thoại phát 4G:** bật *Điểm truy cập cá nhân* trên một điện thoại, cho máy host **và** người chơi cùng kết nối vào đó. Cách này phù hợp với nhóm nhỏ, khoảng 10–15 người, tùy máy.
- **Máy host tự phát Wi-Fi:** Windows có *Settings → Network & Internet → Mobile hotspot*. Người chơi kết nối vào Wi-Fi của laptop.
- **Router 4G/bộ phát Wi-Fi riêng:** ổn định nhất cho đông người, từ 30 người trở lên.

Ka-tok gần như không tốn dữ liệu, vì toàn bộ lưu lượng chỉ chạy trong mạng nội bộ.

### Cách C: Người chơi dùng 4G của chính họ (không chung mạng)

Cách này cần đưa server ra Internet bằng một *đường hầm* (tunnel). Máy host phải có Internet.

1. Cài **cloudflared**: <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/>. Không cần tài khoản.
2. Trong lúc Ka-tok đang chạy, mở thêm một terminal và chạy:

   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```

3. Lệnh trên in ra một địa chỉ dạng `https://xxxx-yyyy.trycloudflare.com`.
4. Ở màn hình **sảnh chờ** của host, mở ô chọn địa chỉ (dưới mã QR), chọn **✎ Nhập địa chỉ khác…** rồi dán địa chỉ vừa có. Mã QR sẽ cập nhật theo. Nếu muốn cố định, ghi địa chỉ vào `"publicUrl"` trong `config.json`.

> Tốc độ qua tunnel phụ thuộc Internet của máy host. Ka-tok có bù trễ mạng (xem `latencyCompensationMs`) để người chơi dùng 4G không bị thiệt khi tính giờ.

### Tường lửa Windows (lỗi hay gặp nhất)

Lần đầu chạy, Windows sẽ hỏi *"Allow Node.js to communicate on these networks"*. Hãy **tích cả Private và Public** rồi bấm **Allow access**.

**Dấu hiệu:** điện thoại mở link `http://192.168.x.x:3000` thì trang không tải được, nhưng dùng tunnel (cách C) lại vào được. Từ v1.1, Ka-tok tự kiểm tra tường lửa khi khởi động và in cảnh báo trong terminal, đồng thời hiện dòng chữ đỏ dưới mã QR ở sảnh chờ.

**Cách sửa nhanh:** mở **PowerShell** bằng *Run as administrator* rồi chạy lệnh dưới đây (đổi `3000` nếu bạn đã đổi `port`):

```bash
netsh advfirewall firewall add rule name="Ka-tok" dir=in action=allow protocol=TCP localport=3000 profile=any
```

Hoặc làm thủ công, nếu lỡ bấm *Cancel* hay điện thoại không vào được dù chung mạng:

1. Mở **Windows Security → Firewall & network protection → Allow an app through firewall**.
2. Bấm **Change settings**, tìm **Node.js JavaScript Runtime** và tích cả hai cột **Private** và **Public**.
3. Nên đặt mạng Wi-Fi đang dùng là **Private**: *Settings → Network & Internet → Wi-Fi → (tên mạng) → Network profile type → Private*.

#### Máy có phần mềm diệt virus kèm tường lửa (Symantec, Kaspersky, ESET, Norton, Bitdefender…)

Các phần mềm này **thay thế** tường lửa Windows. Khi đó, mọi luật bạn thêm trong Windows (lệnh `netsh` ở trên, *Allow an app…*) đều **không có tác dụng**. Từ v1.1, Ka-tok tự phát hiện trường hợp này và ghi rõ tên phần mềm trong cảnh báo.

Hãy thêm luật ngay trong phần mềm đó: cho phép kết nối **chiều vào (incoming)**, giao thức **TCP**, **cổng cục bộ 3000**. Ví dụ với **Symantec Endpoint Protection**:

1. Mở Symantec Endpoint Protection (biểu tượng ở khay hệ thống).
2. Chọn **Change Settings**. Ở mục **Network and Host Exploit Mitigation** (bản cũ ghi *Network Threat Protection*), bấm **Configure Settings / Options**, rồi chọn **Configure Firewall Rules**.
3. Bấm **Add**, đặt tên `Ka-tok`, chọn **Allow this traffic**. Ở thẻ **Ports and Protocols**, chọn **TCP**, **Local ports** = `3000`, **Traffic direction** = **Incoming**. Bấm **OK**.
4. Di chuyển luật vừa tạo lên **đầu danh sách** (luật ở trên được ưu tiên), rồi bấm **OK** để lưu.

Tên mục có thể khác đôi chút giữa các phiên bản. Nếu máy do công ty quản lý, thường bạn không sửa được luật; khi đó hãy nhờ IT hoặc dùng **tunnel** (cách C).

Trên **macOS**, nếu hệ thống hỏi *"Do you want the application node to accept incoming network connections?"*, hãy chọn **Allow**.

### Máy có nhiều mạng

Nếu máy host có VPN, máy ảo, Radmin, Hamachi…, Ka-tok có thể hiện nhầm IP. Ô chọn địa chỉ dưới mã QR liệt kê **tất cả** IP của máy; hãy chọn IP cùng dải với Wi-Fi điện thoại đang dùng (thường là `192.168.x.x`).

---

## 5. Cấu hình `config.json`

```json
{
  "port": 3000,
  "hostPassword": "katok2026",
  "publicUrl": "",
  "latencyCompensationMs": 800,
  "autoEndWhenAllAnswered": true,
  "maxPlayers": 150,
  "scoring": {
    "maxPoints": 1000,
    "minPoints": 500,
    "wrongPoints": 0,
    "noAnswerPoints": 0,
    "speedBonus": [300, 200, 100]
  }
}
```

| Khóa | Ý nghĩa |
|---|---|
| `port` | Cổng chạy server. Đổi sang số khác (vd `8080`) nếu báo cổng đang bận. |
| `hostPassword` | Mật khẩu vào màn hình Host. |
| `publicUrl` | Địa chỉ cố định in trên mã QR, ví dụ địa chỉ tunnel. Để trống thì Ka-tok tự dùng IP mạng LAN. |
| `latencyCompensationMs` | Mức trễ mạng tối đa (ms) được bù khi tính thời gian trả lời. Ka-tok dùng đồng hồ của điện thoại nhưng chỉ tin trong phạm vi này để chống gian lận. |
| `autoEndWhenAllAnswered` | `true` thì câu hỏi tự kết thúc khi mọi người đang online đã trả lời xong. |
| `maxPlayers` | Số người chơi tối đa. |
| `scoring` | Quy tắc tính điểm, xem [mục 8](#8-cách-tính-điểm). |

Bạn cũng có thể ghi đè bằng biến môi trường: `PORT`, `HOST_PASSWORD`, `PUBLIC_URL`. Sau khi sửa `config.json`, cần **tắt và chạy lại** server.

---

## 6. Soạn câu hỏi bằng JSON

Mỗi file `.json` trong thư mục **`questions/`** là một **bộ câu hỏi**. Host chọn bộ câu hỏi ở sảnh chờ. Có sẵn file mẫu `questions/mau.json`.

```json
{
  "title": "Đố vui Year End Party 2026",
  "defaults": { "time": 20, "readTime": 4, "points": 1 },
  "shuffleQuestions": false,
  "shuffleAnswers": false,
  "questions": [
    {
      "question": "Thủ đô của Việt Nam là thành phố nào?",
      "answers": ["Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng", "Huế"],
      "correct": "A"
    },
    {
      "question": "Trái đất quay quanh Mặt trời.",
      "answers": ["Đúng", "Sai"],
      "correct": 0,
      "time": 10
    },
    {
      "question": "Những số nào là số nguyên tố?",
      "answers": ["2", "9", "13", "21"],
      "correct": ["A", "C"]
    },
    {
      "question": "Logo này của công ty nào?",
      "answers": ["Công ty A", "Công ty B", "Công ty C", "Công ty D"],
      "correct": "B",
      "image": "images/logo.png",
      "points": 2
    }
  ]
}
```

| Trường | Bắt buộc | Ý nghĩa |
|---|---|---|
| `title` | | Tên bộ câu hỏi hiển thị cho host. |
| `defaults.time` | | Thời gian trả lời mặc định (giây), mặc định 20. |
| `defaults.readTime` | | Số giây hiện câu hỏi **trước** khi hiện đáp án để mọi người kịp đọc, mặc định 3. Đặt `0` để hiện đáp án ngay. |
| `defaults.points` | | Hệ số điểm mặc định, mặc định 1. |
| `shuffleQuestions` | | `true` thì xáo trộn thứ tự câu hỏi mỗi ván. |
| `shuffleAnswers` | | `true` thì xáo trộn thứ tự đáp án. Đáp án đúng vẫn được tính đúng. |
| `question` | ✅ | Nội dung câu hỏi. |
| `answers` | ✅ | Danh sách **2 đến 4** phương án, tương ứng A ▲, B ◆, C ●, D ■. |
| `correct` | ✅ | Đáp án đúng: chữ `"A"`–`"D"`, số `0`–`3`, hoặc mảng nếu có nhiều đáp án đúng (`["A","C"]`). |
| `time` | | Thời gian riêng cho câu này (giây). |
| `readTime` | | Thời gian đọc riêng cho câu này. |
| `points` | | Hệ số điểm: `2` = nhân đôi, `0` = câu khởi động không tính điểm. |
| `image` | | Ảnh minh họa, đường dẫn **tính từ thư mục `questions/`**. Ví dụ đặt ảnh vào `questions/images/logo.png` thì ghi `"images/logo.png"`. |

**Mẹo:**

- Lưu file với mã hóa **UTF-8** để tiếng Việt không bị lỗi. VS Code và Notepad trên Windows 11 mặc định đã là UTF-8.
- Sửa file xong thì bấm **⟳ Tải lại** ở sảnh chờ (hoặc chọn *Tải lại câu hỏi* trong menu ☰), không cần khởi động lại server.
- File sai cú pháp sẽ hiện **lỗi màu đỏ** ngay ở sảnh chờ, kèm số thứ tự câu bị lỗi. Có thể kiểm tra cú pháp JSON tại <https://jsonlint.com>.

---

## 7. Điều khiển khi chơi (Host)

Mỗi câu hỏi đi qua các màn hình theo thứ tự sau. Bấm nút lớn ở góc dưới bên phải, hoặc **Space / Enter / →**, để sang bước tiếp.

| Màn hình | Nội dung | Nút tiếp |
|---|---|---|
| **Sảnh chờ** | Mã QR, địa chỉ vào chơi, danh sách người chơi (bấm vào tên để mời ra) | Bắt đầu ▶ |
| **Chuẩn bị** | Chỉ hiện câu hỏi trong vài giây đọc | Hiện đáp án ⏭ (bỏ qua thời gian đọc) |
| **Câu hỏi** | Câu hỏi, 4 đáp án, đồng hồ (tích tắc ở 5 giây cuối), số người đã trả lời, dải tên người vừa trả lời kèm thời gian. Hết giờ sẽ có tiếng **reng** | Dừng ⏹ (kết thúc sớm) |
| **Đáp án** | Đáp án đúng, biểu đồ số người chọn từng đáp án, top 3 nhanh nhất | Đường đua 🏇 |
| **Đường đua** | Ngựa phi lên theo số điểm vừa được cộng, camera tự co giãn | Bảng điểm 📋 |
| **Bảng kết quả** | Cột *Thứ tự, Người chơi, Đáp án, Thời gian, Điểm lượt này, Tổng điểm*, kèm mũi tên tăng/giảm hạng và ⚡ cho người nhanh nhất | Câu tiếp ▶ |
| **Trao giải** *(sau câu cuối)* | Mỗi màn một giải, hiện dần từ hạng thấp lên hạng 1: ⚡ *Trả lời đúng nhanh nhất* (5 lượt bấm đúng nhanh nhất cả trận), ✔ *Trả lời đúng nhiều nhất*, 🌟 *Xuất sắc nhất mỗi đội* (chỉ khi có đội). Điện thoại người được xướng tên hiện "Bạn được vinh danh!" | Giải tiếp theo ▶ |
| **Chung cuộc** | Bục vinh quang top 3 cá nhân, pháo giấy và nhạc, danh sách các hạng sau | Bục đồng đội 🏆 |
| **Chung cuộc – Đồng đội** *(chỉ khi có đội)* | Bục top 3 đội, cả đội cùng đứng trên một bục | Xuất CSV / Ván mới / Về sảnh |

Trên đầu các màn kết thúc có **thanh điều hướng** (⚡ Nhanh nhất · ✔ Đúng nhiều · 🌟 Xuất sắc đội · 🏅 Cá nhân · 🏆 Đồng đội) để quay lại hoặc nhảy tới màn bất kỳ. Câu khởi động (×0 điểm) không được tính vào các giải.

**Chơi theo đội (tùy chọn):** ở sảnh chờ, host nhập tên đội ngắn (tối đa 12 ký tự), chọn màu rồi bấm **＋ Tạo đội**. Mỗi đội tối đa **3 người**; mọi con ngựa trong đội mang màu của đội. Khi đã có đội còn chỗ, người chơi phải chọn đội lúc vào phòng (và có thể đổi đội cho tới khi bắt đầu). Trên thẻ đội, bấm vào tên để đổi tên, chấm tròn để đổi màu, ✕ để xóa đội. Host cũng có thể chuyển đội cho người chơi trong màn hình chấm tay ✍️ khi đang ở sảnh. **Điểm đội = tổng điểm các thành viên ÷ số thành viên.** Trên đường đua, các thành viên cùng đội chạy ở các làn sát nhau. Không tạo đội thì trò chơi chạy như cũ.

**Thanh công cụ phía trên:**

- 🏇 / 📋: chuyển qua lại giữa đường đua và bảng điểm.
- ✍️ (phím **M**): mở màn hình chấm điểm thủ công.
- 🔊: bật/tắt âm thanh. ⛶ (phím **F**): bật/tắt toàn màn hình.
- 📱 (phím **J**, ngoài sảnh): hiện lại mã QR và link tham gia thật to cho người đến muộn. Bấm **📌 Ghim** để giữ một mã QR nhỏ ở góc màn hình suốt trận.
- ☰: kết thúc game sớm, ván mới (giữ người chơi, điểm về 0), về sảnh và xóa người chơi, xuất CSV, tải lại câu hỏi, đăng xuất.

Có thể mở màn hình host trên **nhiều máy cùng lúc** (một máy nối máy chiếu, một laptop điều khiển). Mọi màn hình luôn đồng bộ với nhau.

**Phía người chơi:** điện thoại chỉ hiện 4 nút hình/chữ cái lớn như Kahoot. Sau khi chọn, máy rung nhẹ và hiện thời gian trả lời. Sau mỗi câu, điện thoại báo đúng/sai, điểm vừa được cộng và hạng hiện tại. Nếu điện thoại khóa màn hình hoặc mất mạng, chỉ cần mở lại trang, người chơi sẽ **tự vào lại** với đúng tên và điểm cũ.

---

## 8. Cách tính điểm

Toàn bộ quy tắc nằm trong `config.json → scoring` (logic ở `src/server/scoring.ts`):

```
Trả lời đúng:   điểm = [minPoints + (maxPoints − minPoints) × (1 − thời_gian / tổng_thời_gian) + thưởng_tốc_độ] × hệ_số_câu
Trả lời sai:    wrongPoints × hệ_số_câu
Không trả lời:  noAnswerPoints × hệ_số_câu
```

- `speedBonus: [300, 200, 100]`: người đúng **nhanh nhất** được +300, nhì +200, ba +100. Có thể thêm hoặc bớt phần tử, hoặc để `[]` nếu không muốn thưởng.
- Ví dụ với cấu hình mặc định, câu 20 giây: trả lời đúng sau 5 giây được `500 + 500 × 0.75 = 875` điểm, cộng thưởng nếu nằm trong top 3 nhanh nhất.
- Muốn đúng là được điểm như nhau, không quan tâm tốc độ: đặt `maxPoints = minPoints` (vd đều là 1000) và `speedBonus: []`.
- Muốn trừ điểm khi trả lời sai: đặt `wrongPoints` là số âm, vd `-200`.

Điểm càng cao thì ngựa chạy càng xa trên đường đua: 1 điểm tương ứng 1 đơn vị trên vạch đo.

---

## 9. Chấm điểm thủ công (dự phòng)

Bấm ✍️ hoặc phím **M** ở bất kỳ màn hình nào để mở. Màn hình này dùng khi:

- **Mạng hoặc điện thoại gặp sự cố:** host đọc câu hỏi, mọi người giơ tay, host nhập điểm bằng tay.
- **Có người không có điện thoại:** thêm người chơi bằng ô *Thêm người chơi*. Những người này có biểu tượng ✍️ và vẫn có ngựa trên đường đua.
- **Có mini game, câu hỏi phụ, cần sửa điểm hoặc phạt điểm.**

Các thao tác:

| Thao tác | Cách làm |
|---|---|
| Cộng/trừ nhanh | Nút −100 / +100 / +500 trên từng dòng. |
| Nhập điểm theo lượt | Gõ số điểm (âm để trừ) vào cột **Điểm lượt** cho nhiều người, ghi chú nếu cần, rồi bấm **✔ Áp dụng** hoặc **🏇 Áp dụng & chạy đua** để ngựa chạy luôn. |
| Điền nhanh | Nhập một giá trị rồi bấm *vào ô trống*. Tiện khi nhiều người được điểm như nhau. |
| Đặt tổng điểm | Gõ tổng điểm mới vào cột **Đặt tổng** rồi bấm *Đặt*. |
| Đổi tên / Xóa | Nút ✎ / 🗑. |

Mọi lần chỉnh đều được lưu vào **Lịch sử chỉnh điểm** và vào cơ sở dữ liệu.

---

## 10. Dữ liệu, sao lưu và khôi phục

| Vị trí | Nội dung |
|---|---|
| `data/ka-tok.sqlite` | Cơ sở dữ liệu SQLite: từng câu trả lời (người, đáp án, thời gian, điểm), các lần chỉnh tay, kết quả cuối mỗi ván. Mở được bằng [DB Browser for SQLite](https://sqlitebrowser.org/). |
| `data/results/*.csv` | Mỗi khi ván chơi kết thúc, file CSV kết quả (điểm từng câu và tổng) được **tự động lưu** vào đây. Mở bằng Excel. |
| Menu ☰ → *Xuất kết quả CSV* | Tải ngay file CSV của ván hiện tại về máy. |

**Tự khôi phục khi sự cố:** nếu server bị tắt đột ngột (mất điện, lỡ đóng cửa sổ…), chỉ cần chạy lại `npm start`. Ván đang chơi sẽ được khôi phục với đầy đủ người chơi và điểm. Câu hỏi đang dở sẽ được hỏi lại. Người chơi tự kết nối lại, host chỉ cần tải lại trang.

**Xóa sạch dữ liệu:** tắt server rồi xóa thư mục `data/`.

---

## 11. Diễn tập với người chơi ảo (bot)

Để thử trước khi có người thật, mở thêm một terminal và chạy:

```bash
npm run bots
```

Lệnh này tạo 8 người chơi ảo tự trả lời ngẫu nhiên. Có thể đổi số lượng và địa chỉ, ví dụ thử tải 50 người:

```bash
npm run bots -- 50 http://192.168.1.23:3000
```

Xóa bot bằng menu ☰ → *Về sảnh & xoá người chơi*, rồi tắt lệnh bằng Ctrl + C.

---

## 12. Khắc phục sự cố

| Vấn đề | Cách xử lý |
|---|---|
| `'node' is not recognized` / `command not found` | Chưa cài Node.js, hoặc chưa khởi động lại máy sau khi cài. Xem [mục 2](#2-cài-đặt-từng-bước). |
| Báo lỗi liên quan tới `node:sqlite` | Node.js quá cũ. Cài bản LTS mới (≥ 22.13). |
| `Cổng 3000 đang bị chương trình khác dùng` | Đổi `"port"` trong `config.json`, hoặc tắt chương trình đang dùng cổng đó (có thể là một cửa sổ Ka-tok khác). |
| Điện thoại không vào được trang | (1) Kiểm tra điện thoại và máy host **chung mạng**. (2) Cho phép Node.js qua **tường lửa** ([mục 4](#tường-lửa-windows-lỗi-hay-gặp-nhất)). (3) Chọn đúng IP ở ô dưới mã QR. (4) Wi-Fi khách có thể chặn thiết bị nhìn thấy nhau, khi đó dùng hotspot. (5) Gõ đúng `http://`, không phải `https://`. |
| Máy host vào được nhưng điện thoại thì không | Gần như chắc chắn do tường lửa hoặc Wi-Fi bật client isolation. |
| Không có tiếng | Bấm vào trang host một lần để trình duyệt cho phép phát tiếng. Kiểm tra nút 🔊 và âm lượng máy. |
| Người chơi bị "Mất kết nối…" | Thường do điện thoại tắt màn hình hoặc sóng yếu. Trang tự kết nối lại sau vài giây mà không mất điểm. |
| Tên bị báo trùng | Mỗi tên chỉ được dùng một lần, hãy thêm số hoặc họ. Host có thể đổi tên trong màn hình ✍️. |
| Bộ câu hỏi không hiện / báo lỗi đỏ | File JSON sai cú pháp. Kiểm tra dấu phẩy và ngoặc, dùng <https://jsonlint.com>, sửa xong bấm ⟳ Tải lại. |
| Quên mật khẩu host | Xem trong `config.json`, hoặc nhìn dòng *Mật khẩu host* in trong cửa sổ terminal lúc khởi động. |

---

## 13. Checklist trước sự kiện

- [ ] Đã chạy `npm install` khi còn Internet.
- [ ] Đã đổi `hostPassword`.
- [ ] Đã soạn câu hỏi và mở thử ở sảnh chờ, không có lỗi đỏ.
- [ ] Đã **thử bằng điện thoại thật** tại địa điểm, trên đúng mạng sẽ dùng.
- [ ] Đã cho phép Node.js qua tường lửa (Private + Public).
- [ ] Đã diễn tập bằng `npm run bots -- 30`.
- [ ] Đã tắt chế độ ngủ/sleep của laptop host và cắm sạc.
- [ ] Màn hình host đã bật toàn màn hình (F), âm thanh to vừa đủ.
- [ ] Đã có phương án dự phòng: biết dùng màn hình ✍️ chấm điểm thủ công.

---

## 14. Dành cho lập trình viên

**Công nghệ:** HTML/CSS/TypeScript thuần (không framework) · Node.js + Express + Socket.IO · SQLite tích hợp sẵn trong Node (`node:sqlite`) · esbuild để đóng gói.

```bash
npm run dev        # tự build lại khi sửa code + tự khởi động lại server
npm run typecheck  # kiểm tra kiểu TypeScript
npm run build      # build ra dist/ (server) và public/js/ (client)
```

```
Katok/
├── config.json            # cấu hình
├── questions/             # bộ câu hỏi JSON (+ ảnh)
├── data/                  # SQLite + CSV kết quả (tự tạo)
├── public/                # HTML, CSS, JS đã build (public/js tự sinh)
├── scripts/bots.mjs       # người chơi ảo
├── build.mjs              # script build (esbuild)
└── src/
    ├── shared/types.ts    # kiểu dữ liệu dùng chung server/client
    ├── server/
    │   ├── index.ts       # Express + Socket.IO, đăng nhập host, API QR/CSV
    │   ├── game.ts        # máy trạng thái của trò chơi
    │   ├── scoring.ts     # công thức tính điểm
    │   ├── questions.ts   # đọc và kiểm tra file câu hỏi
    │   ├── db.ts          # SQLite
    │   └── net.ts         # tìm IP mạng LAN
    └── client/
        ├── landing.ts     # trang chọn Người chơi / Host
        ├── common/        # âm thanh (Web Audio), ngựa SVG, hình đáp án, socket
        ├── host/          # màn hình host: views, đường đua, chấm tay, pháo giấy
        └── player/        # màn hình điện thoại
```

**Luồng trạng thái:** `lobby → getready → question → reveal → race → leaderboard → (câu tiếp | final)`. Server là nguồn sự thật duy nhất và gửi `host:state` cho host, `player:state` riêng cho từng người chơi. Thời gian trả lời đo bằng đồng hồ của điện thoại nhưng bị kẹp trong khoảng `[thời_gian_server − latencyCompensationMs, thời_gian_server]`.
