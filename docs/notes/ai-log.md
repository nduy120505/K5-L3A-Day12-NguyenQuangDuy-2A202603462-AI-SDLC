# Nhật ký dùng AI

Công cụ: **Claude Code** (VS Code extension), model Claude Opus 5.5. Harness: [CLAUDE.md](../../CLAUDE.md).

## Phase 1

| Bước | Việc AI làm | Tôi kiểm tra / quyết định |
|---|---|---|
| Đọc yêu cầu | Tóm tắt README lab; khi tôi dán PRD-0 thì phát hiện **thiếu Test Contract** và dừng lại hỏi thay vì đoán | Dán Test Contract |
| Thiết kế | Đề xuất tách `src/core` thuần JS (dùng chung cho trình duyệt và headless), tuning đọc từ `game.contract.json` | Duyệt |
| Môi trường | `npm install` lỗi ENOSPC (ổ C: còn 0 GB). AI chuyển sang **không dùng dependency**: three.js qua CDN importmap, server tĩnh Node thuần | Chấp nhận. Sau khi dọn ổ C:, three.js được đóng gói sẵn vào `vendor/` để chơi offline |
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

## Phase 2

| Bước | Việc AI làm | Tôi kiểm tra / quyết định |
|---|---|---|
| Đọc ticket | Xếp ưu tiên: core + contract v1.1 (30 điểm test ẩn) → test cho từng tính năng → giao diện | Duyệt |
| Core | Viết lại `game.js` theo đúng 12 bước trong một tick; thêm `maps.js` cho 3 bản đồ chuẩn | Đọc diff |
| Test | 35 test (17 hồi quy theo số chuẩn và 18 test tính năng mới), tất cả chạy CLI headless | `npm test` xanh |
| Lỗi AI mắc, test bắt được | (1) Quỹ đạo nhảy dùng Euler nên chạm đất trễ 2 tick so với 0.7 s; đổi sang công thức chính xác. (2) Recoil chỉ lùi 59/60 bước. (3) Tỏa Sáng làm Gió Lạc `idle` bỏ chạy, trái spec. (4) Bốn test do AI viết sai: làm tròn −10.0003 thành −10, Bóng Mực không bị choáng đuổi kịp và đánh người chơi, … | Sửa code, sửa test kèm lý do |
| Bằng chứng | Bot chơi cả 3 Đêm × 3 seed; thêm né tránh và lướt sau khi bot ngây thơ thua 9/9 | Kết quả thật: thắng 1/9 |
| Giao diện | Menu và chuỗi Đêm, tạm dừng, cài đặt, âm thanh WebAudio, HUD, bảng màu, đồng hồ FPS | **Cần chơi tay và đo FPS** |
| Harness | Cập nhật CLAUDE.md cho phạm vi mới, thêm skill `proof` | |

### Token / chi phí (ước tính)
| Phase | Token | Ghi chú |
|---|---|---|
| 2 | _điền từ `/cost`_ | Một agent duy nhất; viết core theo đúng thứ tự tick một lần để tránh sửa đi sửa lại; test bắt lỗi thay cho việc đoán |

## Phase 3 (Change Request "Đèn cạn dầu", 30 phút)

| Bước | Việc AI làm | Tôi kiểm tra / quyết định |
|---|---|---|
| Phân tích | Liệt kê các luật bị [THAY THẾ] và những test/tài liệu bị ảnh hưởng (C1, C2, C8, C10, C11, P4, P17) | Duyệt |
| Core | Dầu lưu bằng số nguyên 1/60; trạng thái `drain`; `secureZone()` dùng chung cho thắp và châm; luật thắng lúc bình minh; sức chứa; điểm mới | Đọc diff |
| Test | C10/C11 **thay thế** (có chú thích); C1/C2/C8/P4/P17 đổi số kèm lý do; thêm 12 test F1–F12. Không skip test nào | 47/47 xanh |
| Lỗi AI mắc, test bắt được | 4 test do AI viết sai spec: (1) `lantern_lit` thiếu `relight`; (2) quên rằng dầu bị trừ ở bước 2 **trước** bước tương tác, nên đèn 100 vẫn nhận 1 đom đóm; (3) quên rằng Bóng Mực cũng hút trong tick châm dầu (69.9, không phải 70); (4) Bóng Mực trong test không kịp chạm Mây | Sửa test theo spec, ghi lý do trong test |
| Tài liệu | ADR 0001, CHANGELOG (breaking changes), spec/giả định | |
| Bằng chứng | Bot được dạy châm và thắp lại nhưng vẫn thua 9/9 theo luật mới (ghi trung thực) | Test là bằng chứng chính |

### Token / chi phí (ước tính)
| Phase | Token | Ghi chú |
|---|---|---|
| 3 | _điền từ `/cost`_ | Patch có mục tiêu (script Python thay từng đoạn) thay vì viết lại cả file |

## Phase 4 (Release)

| Bước | Việc AI làm | Tôi kiểm tra / quyết định |
|---|---|---|
| Kế hoạch | Bench bản web cần trình duyệt thật, nên chọn Playwright (devDependency); tận dụng nó để kiểm tra UI lần đầu | Duyệt |
| Bench | Cảnh chuẩn ở `src/core/bench.js` (có test); cờ bench trong core (mặc định tắt); `scripts/bench.js` | Lần đầu p1_low **23.7 < 30**, sau đó tối ưu InstancedMesh, cache HUD, bỏ cấp phát, bỏ polling: **64.3** |
| Soak | `scripts/soak.js`; lần đầu tỉ lệ bộ nhớ dao động 1.12–1.23 (có lần vượt 1.2) | Đo bằng GC ×3 và yield, giống nhau ở đầu và cuối: ổn định khoảng 1.13 qua 6 lần |
| Leaderboard | Luật trong `src/core/leaderboard.js`; server lưu `data/leaderboard.json`; `--export-leaderboard` | Test L1–L3 |
| Accessibility | Đổi phím có báo trùng, phụ đề và mũi tên Bóng Mực, giảm chuyển động, chữ ≥ 18 px, ×1.25 | Playwright UI check, 0 lỗi, có ảnh |
| Lỗi quy trình | Commit một lần khi soak test đỏ (`grep` trong chuỗi `&&`) | Phát hiện ngay, sửa ở commit sau; ghi trong retro |

### Token / chi phí (ước tính)
| Phase | Token | Ghi chú |
|---|---|---|
| 4 | _điền từ `/cost`_ | |
