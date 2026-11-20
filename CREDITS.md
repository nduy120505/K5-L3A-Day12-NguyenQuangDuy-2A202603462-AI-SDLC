# CREDITS

## Thư viện và công cụ
- **three.js** 0.170.0 (MIT License, © three.js authors), đóng gói sẵn trong `vendor/three.module.min.js`, giấy phép ở `vendor/three.LICENSE`. https://threejs.org
- **Playwright** 1.48.2 (Apache-2.0, © Microsoft), chỉ là devDependency dùng cho bench và kiểm tra UI tự động; không nằm trong game.
- **Node.js** để chạy server, headless, test, soak.

## Đồ họa và âm thanh
- Mọi mô hình 3D là hình khối dựng bằng code (`src/main.js`, `src/render/world.js`); **không dùng asset ngoài**.
- Mọi âm thanh và nhạc được **tổng hợp lúc chạy bằng WebAudio** (`src/render/audio.js`); không có file âm thanh.
- Bảng màu theo Ticket-02 và Ticket-03 của đề bài.

## Công cụ AI tạo nội dung
- **Claude Code** (Anthropic, model Claude Opus 5.5) viết phần lớn mã nguồn, test, tài liệu và lời thoại trong game (lời Ông Đăng, phụ đề), dưới sự điều phối và kiểm chứng của tác giả. Chi tiết ở [docs/notes/ai-log.md](docs/notes/ai-log.md).
- Không dùng AI tạo ảnh hay âm thanh.

## Bản quyền nội dung
- Nhân vật, bối cảnh và tên gọi "Đảo Đèn Lồng", "Mây", "Bóng Mực", "Gió Lạc", "Ông Đăng" thuộc đề bài lab AI SDLC Day 12.
