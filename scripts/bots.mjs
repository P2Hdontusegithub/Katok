// Fake players for rehearsing / load testing.
//   npm run bots                 → 18 bots on http://localhost:3000
//   npm run bots -- 40 http://192.168.1.5:3000
import { io } from "socket.io-client";

const count = Number(process.argv[2] ?? 18);
const url = process.argv[3] ?? `http://localhost:${process.env.PORT ?? 3000}`;
const NAMES = [
  'Lan', 'Minh', 'Hùng', 'Thảo', 'Tuấn', 'Vy', 'Khoa', 'Ngọc', 'Phúc', 'Trang',
  'Đạt', 'Hà', 'Long', 'My', 'Quân', 'Linh', 'An', 'Bảo', 'Chi', 'Duy',
  'Giang', 'Hoàng', 'Khánh', 'Kiên', 'Lam', 'Mai', 'Nam', 'Nhi', 'Như', 'Phong',
  'Phương', 'Quỳnh', 'Sơn', 'Tâm', 'Thành', 'Thư', 'Tiến', 'Trâm', 'Trí', 'Trung',
  'Tú', 'Uyên', 'Vân', 'Việt', 'Vinh', 'Yến', 'Ánh', 'Bình', 'Cường', 'Diệp',
  'Đức', 'Hải', 'Hiếu', 'Hòa', 'Hồng', 'Hương', 'Huy', 'Hưng', 'Khôi', 'Lộc',
  'Mạnh', 'Nga', 'Nghĩa', 'Nhân', 'Oanh', 'Phát', 'Quốc', 'Sang', 'Sinh', 'Thắng',
  'Thiện', 'Thu', 'Thủy', 'Toàn', 'Trọng', 'Tuyết', 'Xuân', 'Bích', 'Cẩm', 'Châu',
  'Đông', 'Gia', 'Hạnh', 'Hậu', 'Khang', 'Kiệt', 'Kim', 'Liên', 'Loan', 'Lương',
  'Mỹ', 'Ngân', 'Nguyên', 'Nhung', 'Phú', 'Quyên', 'Sỹ', 'Thái', 'Thanh', 'Thịnh',
  'Thúy', 'Trinh', 'Trường', 'Vỹ', 'Ái', 'Ân', 'Bằng', 'Bách', 'Cát', 'Công',
  'Danh', 'Đăng', 'Điệp', 'Dũng', 'Dương', 'Hân', 'Hằng', 'Hào', 'Khả', 'Lâm',
  'Lệ', 'Mẫn', 'Minh Anh', 'Minh Châu', 'Minh Đức', 'Minh Khang', 'Minh Quân', 'Gia Bảo', 'Gia Hân', 'Gia Linh',
  'Hoàng Anh', 'Hoàng Nam', 'Hải Đăng', 'Hải Yến', 'Bảo Ngọc', 'Bảo Anh', 'Khánh Linh', 'Khánh Ngân', 'Tuấn Anh', 'Đức Anh',
  'Phương Anh', 'Quỳnh Anh', 'Thanh Tâm', 'Thanh Trúc', 'Ngọc Anh', 'Ngọc Hà', 'Nhật Minh', 'Nhật Nam', 'Thiên An', 'Thiên Phúc'
];

// [
//  'A1 - 1', 'A1 - 2', 'A1 - 3',
//  'A2 - 1', 'A2 - 2', 'A2 - 3',
//  'A3 - 1', 'A3 - 2', 'A3 - 3',
//  'A4 - 1', 'A4 - 2', 'A4 - 3',
//  'A5 - 1', 'A5 - 2', 'A5 - 3',
//  'A6 - 1', 'A6 - 2', 'A6 - 3'
//];

for (let i = 0; i < count; i++) {
	const socket = io(url, { transports: ["websocket"] });
	const name = `${NAMES[i % NAMES.length]}${i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ""} 🤖`;
	let token;
	let answeredIndex = -1;
	let joining = false;
	const join = (teams) => {
		// With teams set up, bots are spread evenly over the teams (consecutive bots in the same team).
		const max = teams[0]?.max ?? 3;
		const perTeam = Math.max(1, Math.min(max, Math.ceil(count / Math.max(teams.length, 1))));
		const open = teams.filter((t) => t.count < (t.max ?? 3));
		const wanted = teams[Math.floor(i / perTeam) % Math.max(teams.length, 1)];
		const teamId = open.includes(wanted) ? wanted.id : open[0]?.id;
		joining = true;
		socket.emit("player:join", { name, token, teamId }, (r) => {
			joining = false;
			if (r.ok) token = r.token;
			else console.log(`${name}: ${r.error}`);
		});
	};
	// The server sends the team list right after connecting; new bots join once it arrives.
	socket.on("teams", (teams) => {
		if (!token && !joining) join(teams);
	});
	socket.on("connect", () => {
		if (token) join([]);
	});
	socket.on("player:state", (s) => {
		if (
			s?.phase !== "question" ||
			!s.question ||
			answeredIndex === s.question.index
		)
			return;
		answeredIndex = s.question.index;
		const skill = 0.35 + (i % 5) * 0.12;
		const delay =
			600 +
			Math.random() *
				Math.min(s.question.remainingMs * 0.8, 12000) *
				(1.2 - skill);
		const t0 = Date.now();
		setTimeout(() => {
			const choice = Math.floor(Math.random() * s.question.answerCount);
			socket.emit(
				"player:answer",
				{ choice, elapsed: Date.now() - t0 },
				() => {},
			);
		}, delay);
	});
	socket.on("player:kicked", () => socket.close());
}
console.log(`🤖 ${count} bot đang kết nối tới ${url} (Ctrl + C để dừng)`);
