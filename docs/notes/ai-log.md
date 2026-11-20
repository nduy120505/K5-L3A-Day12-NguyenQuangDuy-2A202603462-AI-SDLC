# Nhật ký dùng AI

Công cụ: **Claude Code** (VS Code extension), model Claude Opus 5.5. Harness: [CLAUDE.md](../../CLAUDE.md).

## Phase 1

| Bước | Việc AI làm | Tôi kiểm tra / quyết định |
|---|---|---|
| Đọc yêu cầu | Tóm tắt README lab; khi tôi dán PRD-0 thì phát hiện **thiếu Test Contract** và dừng lại hỏi thay vì đoán | Dán Test Contract |
| Thiết kế | Đề xuất tách `src/core` thuần JS (dùng chung cho trình duyệt và headless), tuning đọc từ `game.contract.json` | Duyệt |
| Môi trường | `npm install` lỗi ENOSPC (ổ C: còn 0 GB). AI chuyển sang **không dùng dependency**: three.js qua CDN importmap, server tĩnh Node thuần | Chấp nhận; cần dọn ổ C: |
| Test trước | Viết 17 test chấp nhận chạy CLI thật | Đọc test |
| Lỗi AI mắc, test bắt được | (1) Choáng ngắn hơn 1 tick vì trừ bộ đếm ngay trong tick tỏa sáng. (2) Bóng Mực đặt trong vùng an toàn khi dựng scenario không bị đẩy ra. (3) Test sinh Bóng Mực sai vì người chơi đứng yên chết trước | Cả 3 đã sửa, test xanh |
| Bằng chứng | Script `npm run proof`: bot chơi trọn đêm và phát lại qua CLI (thắng 3/3 seed), tất định (sha giống nhau), mã lỗi, tốc độ | Xem output |
| Render | Viết `src/main.js` three.js + HUD | **Chơi tay trên trình duyệt** để kiểm tra |

### Lời nhắc chính
1. "Đọc README và cho tôi biết cần làm gì"
2. Dán PRD-0, sau đó dán Test Contract v1.0

### Token / chi phí (ước tính)
| Phase | Token | Ghi chú |
|---|---|---|
| 1 | _điền từ lệnh `/cost` của Claude Code_ | Tiết kiệm: một agent duy nhất, không dùng subagent; test chạy CLI để tránh vòng sửa mù; lõi không dependency |
