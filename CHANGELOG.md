# Changelog

## [v1.0.0 / phase-4] Ticket-04 "Bình minh: phát hành" (contract 1.3)

### Thêm
- **Benchmark** `node scripts/bench.js --seed 42 --duration 30 --out bench.json`: cảnh chuẩn (200 Bóng Mực, 100 đom đóm, L1–L3 sáng), Chromium 1280×720, vsync tắt, camera bay vòng; tính `avg_fps`, `p1_low_fps`, `frame_ms_p95`, `load_ms` đúng định nghĩa.
- **Soak test** `node --expose-gc scripts/soak.js --seed 7 --nights 10 --out soak.json`.
- **Bảng xếp hạng cục bộ**: nhập tên sau màn Bình Minh hoặc khi thua; lưu top 10 trên đĩa (`data/leaderboard.json`); màn hình Bảng xếp hạng; lệnh `--export-leaderboard`.
- **Dễ tiếp cận**: đổi mọi phím (báo trùng, khôi phục mặc định), phụ đề và chỉ báo (Bóng Mực xuất hiện kèm mũi tên, gió, 10 s cuối, đèn dưới 30 dầu), giảm chuyển động, chữ ≥ 18 px và tùy chọn ×1.25.
- Kiểm tra UI tự động bằng Playwright (`npm run ui-check`) kèm ảnh chụp; retro.

### Thay đổi
- Render Bóng Mực và đom đóm bằng **InstancedMesh** (p1_low từ 23.7 lên 64.3 FPS trên Intel UHD 620); HUD chỉ ghi DOM khi giá trị đổi; bỏ cấp phát mới trong mỗi khung hình.
- `run_cmd` thành `node scripts/serve.js` (để nhận thêm tham số); `build_cmd` cài thêm Chromium cho bench.
- Contract thêm `bench_cmd`, `soak_cmd`; `contract_version` lên 1.3. Không đổi luật hay output headless.

## [phase-3] Ticket-03 "Đèn cạn dầu" (contract 1.2)

### ⚠ Breaking changes
- **Luật thắng:** không còn thắng khi đủ đèn. Chỉ thắng ở bình minh nếu số đèn sáng ≥ 60% (3/5, 4/6, 5/7). `game_over.reason`: `all_lit` **bị bỏ**, thêm `dawn_survived`.
- **Thời lượng Đêm:** 300/330/360 s → **240/270/300 s**.
- **Điểm:** đom đóm nạp +10 → **+5** (gồm cả châm dầu); thắp lại +40; trúng Tỏa Sáng khi đang `drain` +15; bình minh +50 + floor(fuel) mỗi đèn sáng; **bỏ** thưởng thời gian (`per_second_left: 0`).
- **Đèn sáng có thể tắt:** dầu 100, hao 1/s. Đèn sáng **nhận** đom đóm để châm dầu (trước đây không nhận). Hết dầu thì `lantern_out`, `deposited = 0`.
- **Vùng an toàn:** mất khi fuel < 30 (trước đây đèn sáng luôn an toàn).
- **Bóng Mực:** thêm trạng thái `drain`. `wander` đi tìm đèn yếu.
- **Sức chứa:** không còn cố định 10 mà là `10 + 2 × successful_lights` (tối đa 20).
- **Snapshot:** đèn thêm `fuel`, `ever_lit`, `relit_count`; player thêm `capacity`.
- **Sự kiện:** `lantern_lit` thêm `relight`; thêm `refuel`, `lantern_out`, `fuel_drain`.
- **Scenario:** đèn thêm `fuel`, `ever_lit` (đèn `lit: true` không có fuel thì mặc định 100); player thêm `successful_lights`; shades thêm `target_lantern_id`.
- **Tuning:** thêm `fuel_max, fuel_decay_per_s, fuel_per_mote, relight_cost, win_ratio, drain_per_s, low_fuel_threshold, capacity_max`.

### Thêm
- Chế độ "Bảng màu dễ phân biệt" (được lưu): viền và mắt Bóng Mực #00B3FF, màu cảnh báo #FFFFFF kèm ⚠, đèn tắt xẹp 20% và có vết rách, đèn sắp cạn nhấp nháy 1 Hz.
- Thanh dầu trên đèn; HUD `mang/sức chứa` và `đèn sáng (cần N)`; gợi ý thắp lại / châm dầu.
- ADR: [docs/adr/0001-lantern-fuel-and-dawn-win.md](docs/adr/0001-lantern-fuel-and-dawn-win.md).

## [phase-2] Ticket-02 "Ba hòn đảo" (contract 1.1)
- Số chuẩn, 3 bản đồ, lướt, rơi, tạm dừng, Gió Lạc, Bùa Gió, gió, chuỗi 3 Đêm, cài đặt, âm thanh, HUD đầy đủ.

## [phase-1] PRD-0 (contract 1.0)
- Đêm 1 chơi được, headless theo Test Contract 1.0.
