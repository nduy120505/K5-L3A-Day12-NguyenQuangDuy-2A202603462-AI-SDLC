# CLAUDE.md: Đảo Đèn Lồng (harness cho agent)

## Lệnh
- Không có dependency npm. Chạy game: `npm start` (http://localhost:5173, thêm `?night=2` để vào thẳng Đêm 2) · Test: `npm test`
- three.js 0.170.0 đóng gói sẵn trong `vendor/`, nạp qua importmap trong `index.html`
- Headless: `node src/headless.js --seed 1 --night 1|2|3 --ticks 600 --out out.jsonl [--scenario f.json] [--inputs f.json]`
- Bằng chứng: `npm run proof -- phase-N` (skill `.claude/skills/proof`)
- Phase 4: `node scripts/bench.js --seed 42 --duration 30 --out bench.json` · `node --expose-gc scripts/soak.js --seed 7 --nights 10 --out soak.json` · `npm run ui-check` (Playwright, ảnh trong docs/proof/phase-4/screens) · `node scripts/serve.js --export-leaderboard out.json`
- Đừng nối `npm test | grep … && git commit`: grep trả 0 kể cả khi test đỏ. Kiểm tra `ℹ fail 0` trước khi commit.

## Kiến trúc (bắt buộc giữ)
- `src/core/` là logic thuần JS, KHÔNG import three/DOM. `game.js` = sim, `maps.js` = 3 bản đồ chuẩn (Ticket-02), `validate.js` = định dạng inputs/scenario.
- `Game.step()` theo ĐÚNG 12 bước trong một tick của Ticket-02 (pause → counters → move → pickup → lantern → safe zone → pulse → AI → contact → spawn → win/lose). Không đổi thứ tự.
- Số tuning chỉ đọc từ `game.contract.json`. Số chuẩn khác của ticket nằm trong `STD` (game.js) và `maps.js`. Không có số ma thuật rải rác.
- 60 tick/s; mọi ngẫu nhiên đi qua RNG có seed. Không dùng `Math.random`/`Date` trong `src/core/`.
- Cờ `bench` của `Game` (không sát thương, không nhặt, không hao dầu, không kết thúc) chỉ dùng cho cảnh benchmark; headless/gameplay luôn tắt.
- Render nhiều thực thể bằng InstancedMesh; không cấp phát `new Vector3/Matrix4` trong vòng lặp khung hình; HUD chỉ ghi DOM khi giá trị đổi.
- `src/main.js` và `src/render/` chỉ đọc state. Phần sáng tạo (đèn trời, lá bay, âm thanh) chỉ nằm ở đây, không làm đổi output headless.

## Quy tắc
- Contract v1.2: trạng thái Bóng Mực là `spawning|wander|chase|recoil|stunned|drain`. Gió Lạc là `idle|chase|flee|removed`.
- Dầu đèn là số nguyên 1/60 (`fuelU`); chỉ làm tròn khi xuất (1 chữ số). Trừ dầu ở bước 2, đèn tắt ngay sau đó. Không còn thắng sớm (ADR 0001).
- Luật bị thay thì cập nhật hoặc thay test **kèm chú thích lý do**, không skip; ghi breaking change vào `CHANGELOG.md`.
- Đổi luật → cập nhật `docs/notes/assumptions.md`, `docs/notes/spec-phase2.md` và test. Mỗi tính năng mới phải có ≥ 1 scenario headless.
- Không viết test "luôn đạt"; không sửa tay `docs/proof/`. Sửa test thì ghi lý do vào `docs/notes/ai-log.md`.
- Chạy `npm test` trước khi báo xong. Không commit `.env`/key.
