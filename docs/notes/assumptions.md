# Giả định và tiêu chí nghiệm thu

## Phase 1 (PRD-0 + Test Contract v1.0)

### Tiêu chí nghiệm thu → bằng chứng
| # | Yêu cầu | Kiểm chứng |
|---|---|---|
| R1 | Đêm 1, Đảo Bến tròn, 5 Đèn Lồng Lớn | C1 (5 đèn ở tick 0) |
| R2 | Đi, nhảy, camera 3D | C4 (tốc độ, yaw, chuẩn hóa), C5 (nhảy); camera: chơi tay |
| R3 | Đom đóm rải rác, nhặt được | C6, C7; bot nhặt 27–44 con |
| R4 | Nạp ánh sáng thắp đèn | C8, C9 |
| R5 | Bóng Mực đuổi, chạm thì mất máu | C12 |
| R6 | Tỏa sáng xua Bóng Mực, tốn ánh sáng | C11 |
| R7 | Bóng Mực sợ đèn | C14 (safe_radius) |
| R8 | Thắng / thua / điểm | C10, C13; bot thắng 3/3 seed |
| R9 | HUD, chơi lại | chơi tay (HUD: lửa, ánh sáng, hồi chiêu, đèn, thời gian, điểm; phím R) |
| Contract | JSONL, tick model, mã thoát, tất định | C2, C3, C16, C17 + proof mục 3–4 |

### Giả định cho chỗ mơ hồ
| Chủ đề | Giả định | Lý do |
|---|---|---|
| "Máu" | = `flames` (3 ngọn lửa). Hết lửa thì thua `no_flames` | Contract dùng tên `flames` |
| Hết giờ | Hết `night1_duration_s` = 300 s mà chưa thắp đủ thì **thua** `dawn` | Contract có `reason: dawn` với `lost` |
| Nhặt đom đóm | **Tự động** khi ở trong `pickup_radius`, nếu chưa đầy `carry_capacity` | Chơi mượt; contract không có nút nhặt |
| Nạp đèn | Cạnh lên `interact` sẽ nạp `min(carried, cost − deposited)` vào đèn **chưa thắp gần nhất** trong `interact_radius`. Nạp nhiều lần được | Cho phép nạp từng phần |
| Thắp | `deposited ≥ lantern_cost` thì `lit`, +`per_lantern` | |
| Tỏa sáng | Cần `carried ≥ pulse_cost` và hết hồi chiêu. Thiếu ánh sáng thì không có gì xảy ra, không có event. Không trúng con nào vẫn tốn ánh sáng và vẫn ghi event `pulse` với `stunned_ids: []` | "tốn ánh sáng" |
| Choáng | Đứng im `pulse_stun_s`, không gây sát thương. Bị đẩy `pulse_push_m` ra xa người chơi theo XZ | |
| Bị chạm | Bóng Mực không choáng trong `shade_hit_radius`, người chơi không bất tử: −1 lửa, rơi `floor(carried × hit_drop_ratio)` (ánh sáng rơi **mất hẳn**, không sinh lại đom đóm), bất tử `invuln_s` | Đơn giản, tất định |
| Vùng an toàn | Chỉ đèn **đã thắp** mới đẩy Bóng Mực ra ngoài `safe_radius` (khoảng cách sau khi đẩy > r). Áp dụng cả khi dựng scenario | "sợ đèn" = sợ ánh sáng |
| Rơi khỏi đảo | Không có (`fall_enabled: false`): mép đảo bán kính 40 m là tường | |
| Điểm thưởng thắng | `per_second_left × floor(time_left)` + `per_flame_left × flames`, chỉ cộng khi thắng | |
| Đồng thời thắng và mất lửa trong cùng tick | Ưu tiên `all_lit` > `no_flames` > `dawn` | |
| Sinh ngẫu nhiên (mặc định) | 30 đom đóm lúc đầu, cứ 3 s thêm 1 nếu < 30. 2 Bóng Mực lúc đầu ở mép đảo (không phát event), cứ 30 s thêm 1 (event `shade_spawned`), tối đa 6 | |
| Scenario | `random_* = false` và không có danh sách thì không có con nào. Có danh sách thì thay danh sách ban đầu, sinh thêm vẫn theo `random_*`. Đèn có id lạ thì mã thoát 2 | |
| Snapshot cuối | Luôn ghi snapshot của trạng thái cuối, kể cả khi tick cuối không chia hết cho `--snapshot-every` | Dễ kiểm tra |
| Vị trí đèn | Vòng tròn bán kính 25 m, L1 tại (0, 0, 25), các đèn sau cách nhau 72° | |

## Phase 2 (Ticket-02 + Contract v1.1)

Ticket-02 **thay toàn bộ số tự chọn của Phase 1** bằng số chuẩn (xem `game.contract.json`). Những giả định cũ đã bị thay:
- Nhặt đom đóm **không** còn được điểm; +10 tính cho mỗi đom đóm **nạp** vào đèn.
- Ra khỏi đảo giờ là **rơi** (`fall_enabled: true`). Mép đảo không còn là tường.
- Bóng Mực xuất hiện từ tick 300 (trước đây có 2 con ngay từ đầu).
- Đom đóm rơi khi bị đánh giờ **nằm trên đất** và nhặt lại được (trước đây mất hẳn).

Spec và tiêu chí nghiệm thu: [spec-phase2.md](spec-phase2.md).

| Chủ đề | Giả định | Lý do |
|---|---|---|
| Điểm xuất phát Đêm 3 | **(0, 0, −30)**, tầng 0, phía nam | (0, 0, 0) nằm trong tháp chuông (tâm tầng 2). Ticket không nói rõ |
| Điểm xuất phát Đêm 2 | (0, 0, 0), tâm đảo A | |
| `spawning` | Kéo dài 30 tick: đứng yên, không gây sát thương, Tỏa Sáng vẫn trúng | Ticket chỉ đặt tên trạng thái |
| `wander` | Trôi 1 m/s, đổi hướng ngẫu nhiên (theo seed) mỗi 120 tick, hướng vào tâm khi ra gần mép | Không quy định tốc độ |
| Trạng thái sau choáng / recoil / spawning | Về `wander`, rồi trong cùng tick thành `chase` nếu ≤ 12 m | |
| Bóng Mực trên địa hình | Bay ở độ cao mặt đất + 1 m, bay qua vách; vật cản duy nhất là tháp chuông | "Sinh vật trong sương" |
| Va vách (người chơi) | Bước lên được tối đa 0.35 m mỗi tick (đủ cho dốc), cao hơn thì là tường | Vách đứng |
| Nhảy | Bước tích phân chính xác y += v·dt − g·dt²/2, nên chạm đất sau đúng 0.7 s; bục nhảy bay khoảng 1.4 s | Khớp số trong ticket |
| Snapshot `player.invuln` | **boolean** (đang bất tử hay không). Các trường khác có hậu tố `_s` là số giây | Tên không có `_s` |
| `night_start` | Ghi là dòng đầu tiên, `tick: 0`, trước snapshot tick 0 | Dựng scenario không phát event; `night_start` là event của Đêm |
| Gió | Hướng chọn bằng RNG ở thời điểm báo trước (2 s trước khi nổi), là số nguyên độ; nổi tại sim tick 1800k, tắt sau 300 tick; `dir_deg` là `null` cho tới cơn gió đầu tiên | |
| Gió Lạc idle | Lượn vòng 2 m/s quanh điểm sinh; Tỏa Sáng không ảnh hưởng con đang `idle` | Ticket chỉ nói `chase` / `flee` |
| Gió Lạc `removed` | Vẫn nằm trong mảng `drifters` với state `removed` | Để test thấy được vòng đời |
| Tỏa Sáng trúng Gió Lạc | Không cộng điểm và không có trong `stunned_ids` (chỉ Bóng Mực) | Điểm chuẩn chỉ nói Bóng Mực |
| Đom đóm rơi ra ngoài đảo | Giữ nguyên vị trí (có thể không nhặt được), hết hạn sau 480 tick | Hiếm gặp |
| Tạm dừng trong bản có giao diện | Menu tạm dừng dừng hẳn vòng lặp sim; headless dùng input `pause` của core | Hai cách cho cùng một kết quả: logic đứng yên |
| Tổng điểm (giao diện) | Tổng điểm các Đêm đã thắng; thua thì chơi lại Đêm đó, không cộng điểm | Ticket |

## Phase 3 (Ticket-03 + Contract v1.2)
Mô hình đèn và luật thắng: [ADR 0001](../adr/0001-lantern-fuel-and-dawn-win.md). Breaking changes: [CHANGELOG](../../CHANGELOG.md).

| Chủ đề | Giả định |
|---|---|
| Đèn `wander` khi không có đèn yếu | Trôi 1 m/s về đèn **tắt** gần nhất, dừng cách 3 m; không có đèn tắt thì trôi ngẫu nhiên |
| Tốc độ khi đi tới đèn yếu | Tốc độ đuổi (4 / 4.5 m/s) |
| `fuel_drain` | Một sự kiện cho mỗi Bóng Mực, mỗi 60 tick tính từ lúc nó vào `drain` |
| Đèn `lit: true` trong scenario | `ever_lit` mặc định true; fuel mặc định 100 |
| Điểm thêm trong `tuning.score` | `per_relight: 40`, `per_stun_drain: 15`, `per_lit_at_dawn: 50` (khóa thêm, không thay khóa cũ) |
| Thắp/châm khi Bóng Mực ở trong 6 m | Dùng chung một cơ chế đẩy ra ≤ 30 tick, không gây sát thương |
