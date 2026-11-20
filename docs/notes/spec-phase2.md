# Spec Phase 2 (Ticket-02 "Ba hòn đảo"): tiêu chí nghiệm thu

Mỗi tiêu chí ghi theo dạng "làm A thì thấy B", kèm cách kiểm chứng. `Pn`/`Cn` là tên test trong [tests/phase2.test.js](../../tests/phase2.test.js) và [tests/contract.test.js](../../tests/contract.test.js). Tất cả test đều chạy CLI headless thật.

## Phần 1: Số chuẩn (regression)
| Tiêu chí | Kiểm chứng |
|---|---|
| Chạy 6 m/s, `move` xoay theo `cam_yaw_deg`, vector được chuẩn hóa | C4 |
| Nhảy 7 m/s, g = 20: chạm đất sau đúng 0.7 s; nhảy giữa không trung bị bỏ qua | C5 |
| Nhặt khi XZ ≤ 1.0 và chênh cao ≤ 1.5; sức chứa 10 | C6, C7 |
| Nạp `min(mang, thiếu)` vào đèn chưa sáng gần nhất (bằng nhau thì id nhỏ), bán kính 2.0; +10 mỗi đom đóm **nạp**; đèn cần 10 | C8, C9 |
| Tỏa Sáng: tốn 3, bán kính 5 tính 3D từ chân + 0.8; choáng 120 tick; đẩy 4 m trong 15 tick; hồi chiêu 3 s; +5 mỗi con | C12, C13 |
| Bóng Mực 4 m/s; trúng: −1 lửa, rơi floor(n/2) ra vành 1.5–2.5 m (TTL 480), bất tử 90 tick, recoil 2 m / 60 tick | C14 |
| Thứ tự kết thúc: hết lửa → thua; đủ đèn → thắng (kể cả đúng tick hết giờ); hết giờ → `dawn` | C10, C11, C15 |
| Vùng an toàn 6 m chặn Bóng Mực; bóng ở trong lúc đèn vừa thắp bị đẩy ra trong ≤ 30 tick, không gây sát thương | C16, P16 |
| Đom đóm: 20 điểm khác nhau lúc đầu; cứ 240 tick +1 nếu < 30; đom đóm rơi hết hạn sau 480 tick | C1, P14 |
| Bóng Mực: 2 con ở tick 300, sau đó cứ 480/420/360 tick một con, cách người chơi ≥ 15 m, id S1, S2… | P13 |
| Trạng thái Bóng Mực: `spawning → wander ↔ chase` (12 m / 18 m), `recoil`, `stunned` | P13, P15, C13, C14 |
| Tất định trên cả 3 Đêm | C3, proof mục 3 |
| Một Đêm đầy đủ (21 600 tick) chạy ≤ 30 s | P18 (đo được khoảng 0.3 s) |

## Phần 2: Bản đồ chuẩn
| Tiêu chí | Kiểm chứng |
|---|---|
| Đêm 1: đèn đúng tọa độ, đảo bán kính 40, ra ngoài thì rơi | C1, P3 |
| Đêm 2: 6 đèn L1…L6 đúng tọa độ, cầu tre nối hai đảo, bước khỏi cầu thì rơi | P10, P17 |
| Đêm 2: bục nhảy phóng (14 m/s lên, 24 m/s ngang), đáp đảo kia sau khoảng 1.4 s, phím di chuyển không ghi đè | P9 |
| Đêm 3: vách đứng chặn, dốc lên Y = 3, bục nhảy lên tầng 2 (Y = 6), tháp chuông chặn | P11 |
| Đêm 3: cứ 30 s có gió 5 s đẩy 2 m/s, báo trước 2 s (lá bay và âm thanh); tắt bằng `wind_enabled` | P12; báo trước: chơi tay |

## Phần 3: Tính năng mới
| Tính năng | Tiêu chí nghiệm thu | Kiểm chứng |
|---|---|---|
| **Lướt** | Nhấn (cạnh lên) thì đi 14 m/s trong 12 tick theo hướng đang đi, hoặc hướng mặt nếu đứng yên; hồi chiêu 1.5 s tính từ lúc bắt đầu; trên không giữ độ cao; không bất tử | P1, P2 |
| **Rơi khỏi đảo** | Y < −10: −1 lửa đúng 1 lần (bỏ qua bất tử), mất hết đom đóm (`lost`), chờ 60 tick rồi hồi sinh ở điểm xuất phát, vận tốc 0, bất tử 90 tick; hết lửa thì thua ngay | P3 |
| **Gió Lạc** | `idle → chase` khi mang ≥ 5 và cách ≤ 15 m; chạm (≤ 1.2 m) thì cướp min(3, mang), chuyển `flee` 240 tick rồi `removed`; bất tử không chặn; không mất lửa | P5 |
| Gió Lạc vs Tỏa Sáng | Đang `chase` thì chuyển `flee`, không cướp; đang `flee` có đồ thì thả lại thành đom đóm rơi, có `drifter_drop`, biến mất sau 120 tick | P6 |
| Gió Lạc: lịch sinh | Đêm 2–3 ở tick 1200, 2400…, tối đa 2 con, id D1…; không có ở Đêm 1 hoặc khi `random_drifters = false` | P7 |
| **Bùa Gió** | Nhặt như đom đóm thì có `charm_picked` (600 tick), chạy 7.2 m/s, lướt không hồi chiêu; xuất hiện lại sau 2700 tick | P8 |
| **Tạm dừng** | `pause` (cạnh lên) làm tick tiếp tục tăng nhưng `sim_tick`, thời gian và vị trí đứng yên; snapshot `state: "paused"`; có sự kiện `paused` / `resumed` | P4 |
| **Chuỗi 3 Đêm** | Menu → giới thiệu Đêm (tên đảo, lời Ông Đăng) → chơi → kết quả → Đêm kế; thắng Đêm 3 thì hiện màn Bình Minh với tổng điểm; thua thì chơi lại Đêm đó; lửa hồi đầy mỗi Đêm | Chơi tay; P17 (lửa đầy, thời lượng) |
| **Menu tạm dừng** | Esc/P mở menu Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu; logic đứng yên | Chơi tay |
| **Cài đặt** | Âm lượng và độ nhạy chuột lưu trong `localStorage`, giữ được khi mở lại game | Chơi tay (tải lại trang) |
| **Âm thanh** | Nhạc nền và hiệu ứng cho: nhặt, thắp, tỏa sáng, bị đánh, nhảy, lướt, thắng, thua, Bóng Mực xuất hiện, đếm ngược 10 s | Chơi tay (nhảy được phát hiện ở lớp hiển thị vì contract không có event nhảy) |
| **HUD** | Lửa trên trái; mm:ss trên giữa, đỏ và nhấp nháy khi ≤ 30 s; đèn k/n và điểm trên phải; thanh 10 ô dưới giữa; biểu tượng hồi chiêu lướt và tỏa sáng dưới phải; "E — Nạp ánh sáng (x/10)"; mũi tên tới đèn gần nhất khi nó ở ngoài màn hình | Chơi tay / ảnh chụp |
| **Bảng màu** | Đúng mã hex của ticket cho trời, sương, cỏ, cát, gỗ, biển mây, đèn, đom đóm, Bóng Mực, Mây, Bùa, Gió Lạc, UI (`PAL` trong `src/render/world.js`); ánh sáng môi trường = 0.15 + 0.55 × tỉ lệ đèn sáng | Đọc code |
| **Hiệu năng** | ≥ 30 FPS trung bình ở 1280×720 | Đồng hồ FPS ở góc dưới trái (trung bình 30 s); **cần đo trên máy thật** |
