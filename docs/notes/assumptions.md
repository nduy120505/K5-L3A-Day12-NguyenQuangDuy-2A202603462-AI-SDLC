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
