# CLAUDE.md — Đảo Đèn Lồng (harness cho agent)

## Lệnh
- Không có dependency npm. Chạy game: `npm start` (http://localhost:5173) · Test: `npm test`
- three.js nạp từ CDN qua importmap trong `index.html` (ổ C: đầy, không cài được node_modules)
- Headless: `node src/headless.js --seed 1 --night 1 --ticks 600 --out out.jsonl [--scenario f.json] [--inputs f.json]`
- Bằng chứng: `npm run proof` (ghi vào `docs/proof/`)

## Kiến trúc (bắt buộc giữ)
- `src/core/` = logic thuần JS, KHÔNG import three/DOM. Chạy giống hệt ở trình duyệt và Node.
- `src/headless.js` = CLI theo Test Contract v1.0; `src/main.js` + `src/render/` = hiển thị Three.js, chỉ đọc state.
- Tuning chỉ có MỘT nguồn: `game.contract.json` → không hard-code số tuning trong code.
- Tick cố định 60/s. Mọi ngẫu nhiên đi qua RNG có seed (`src/core/rng.js`). Không dùng `Math.random`/`Date` trong core.

## Quy tắc
- Đổi luật/tuning → cập nhật `docs/notes/assumptions.md` + test tương ứng.
- Không viết test "luôn đạt"; không sửa tay output trong `docs/proof/`.
- Phần sáng tạo thêm chỉ ở lớp render, hoặc tắt khi headless; không làm đổi output contract.
- Chạy `npm test` trước khi báo xong. Không commit `.env`/key.
