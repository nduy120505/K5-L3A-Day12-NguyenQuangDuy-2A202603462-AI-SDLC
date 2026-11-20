# CLAUDE.md: Đảo Đèn Lồng (harness cho agent)

## Lệnh
- Không có dependency npm. Chạy game: `npm start` (http://localhost:5173, thêm `?night=2` để vào thẳng Đêm 2) · Test: `npm test`
- three.js 0.170.0 đóng gói sẵn trong `vendor/`, nạp qua importmap trong `index.html`
- Headless: `node src/headless.js --seed 1 --night 1|2|3 --ticks 600 --out out.jsonl [--scenario f.json] [--inputs f.json]`
- Bằng chứng: `npm run proof -- phase-N` (skill `.claude/skills/proof`)

## Kiến trúc (bắt buộc giữ)
- `src/core/` là logic thuần JS, KHÔNG import three/DOM. `game.js` = sim, `maps.js` = 3 bản đồ chuẩn (Ticket-02), `validate.js` = định dạng inputs/scenario.
- `Game.step()` theo ĐÚNG 12 bước trong một tick của Ticket-02 (pause → counters → move → pickup → lantern → safe zone → pulse → AI → contact → spawn → win/lose). Không đổi thứ tự.
- Số tuning chỉ đọc từ `game.contract.json`. Số chuẩn khác của ticket nằm trong `STD` (game.js) và `maps.js`. Không có số ma thuật rải rác.
- 60 tick/s; mọi ngẫu nhiên đi qua RNG có seed. Không dùng `Math.random`/`Date` trong `src/core/`.
- `src/main.js` và `src/render/` chỉ đọc state. Phần sáng tạo (đèn trời, lá bay, âm thanh) chỉ nằm ở đây, không làm đổi output headless.

## Quy tắc
- Contract v1.1: tên trạng thái Bóng Mực phải là `spawning|wander|chase|recoil|stunned`. Gió Lạc là `idle|chase|flee|removed`.
- Đổi luật → cập nhật `docs/notes/assumptions.md`, `docs/notes/spec-phase2.md` và test. Mỗi tính năng mới phải có ≥ 1 scenario headless.
- Không viết test "luôn đạt"; không sửa tay `docs/proof/`. Sửa test thì ghi lý do vào `docs/notes/ai-log.md`.
- Chạy `npm test` trước khi báo xong. Không commit `.env`/key.
