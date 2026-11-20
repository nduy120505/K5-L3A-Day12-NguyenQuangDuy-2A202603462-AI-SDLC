# ADR 0001: Đèn có nhiên liệu, thắng khi giữ đảo sáng tới bình minh

- **Trạng thái:** Chấp nhận (Phase 3, Ticket-03, contract v1.2)
- **Thay thế:** luật "đèn đã sáng không nhận thêm", "Bóng Mực không bao giờ vào vùng an toàn", "thắng ngay khi tất cả đèn sáng", công thức điểm cũ.

## Bối cảnh
Người chơi giỏi thắp hết đèn trong 2 phút rồi game kết thúc. Nhà thiết kế muốn căng thẳng kéo dài tới cuối Đêm, nên mục tiêu đổi thành *giữ đảo sáng tới bình minh*.

## Quyết định

### 1. Mô hình trạng thái đèn
Trước đây đèn có hai trạng thái và chỉ đi một chiều: `unlit → lit` (kết thúc). Giờ thành một vòng:

```
            nạp đủ (10 lần đầu / 5 nếu ever_lit)
  unlit ───────────────────────────────────────▶ lit (fuel = 100)
    ▲                                              │  −1/s, −5/s cho mỗi Bóng Mực đang drain
    │  fuel ≤ 0 → lantern_out, deposited = 0,      │  E: refuel +10/đom đóm (tối đa 100)
    └──────────── ever_lit = true ◀────────────────┘
                      lit & fuel < 30  ⇒  mất vùng an toàn, Bóng Mực wander tìm tới hút
```

- Dầu lưu bằng **số nguyên đơn vị 1/60** (`fuelU`, tối đa 6000). Hao 1 đơn vị/tick, hút 5 đơn vị/tick cho mỗi Bóng Mực. Nhờ vậy không có sai số số thực, và output làm tròn 1 chữ số chỉ khi xuất.
- Thêm `ever_lit` và `relit_count`. Chi phí thắp phụ thuộc `ever_lit`.
- Thứ tự trong tick: dầu bị trừ ở **bước 2** (cùng các bộ đếm), đèn `fuel ≤ 0` tắt ngay sau đó, trước khi di chuyển và tương tác. Hệ quả có chủ đích: đèn đặt 100 dầu ở tick 0 chỉ còn 99.98 khi bấm E ở bước 5, nên vẫn nhận 1 đom đóm (test F2 ghi rõ điều này).
- Chọn đèn khi bấm E: chỉ xét đèn *nhận được* (chưa sáng, hoặc sáng mà `ceil((100 − fuel)/10) > 0`), chọn gần nhất, bằng nhau thì id nhỏ.
- Vùng an toàn: `litZones()` chỉ gồm đèn sáng có `fuel ≥ 30`. Thắp, thắp lại, hoặc châm lên ≥ 30 đều gọi `secureZone()`: Bóng Mực đang drain đèn đó về `wander`, con nào ở trong 6 m bị đẩy ra trong ≤ 30 tick và không gây sát thương.

### 2. Trạng thái Bóng Mực `drain`
`wander` sẽ nhắm tới đèn yếu gần nhất (sáng, fuel < 30; bằng nhau thì id nhỏ) với tốc độ đuổi. Khi cách ≤ 2 m thì chuyển `drain`: đứng yên và hút. `drain` thoát sang `chase` khi Mây vào trong 6 m, sang `stunned` khi trúng Tỏa Sáng (+15 thay vì +5), sang `wander` khi đèn tắt, khi được châm lên ≥ 30, hoặc khi cách đèn > 2 m. Mỗi 60 tick hút phát một sự kiện `fuel_drain`. Không có đèn yếu thì `wander` trôi chậm về đèn tắt gần nhất (giả định của tôi cho cụm "như trước").

### 3. Luật thắng
Bỏ thắng sớm. Ở bước xét thắng/thua của mỗi tick, theo thứ tự:
1. hết lửa → `lost/no_flames` (kể cả ở tick bình minh);
2. hết giờ → nếu số đèn sáng ≥ `ceil(0.6 × tổng)` thì `won/dawn_survived`, ngược lại `lost/dawn`.

Thưởng bình minh: mỗi đèn sáng +50 + floor(fuel), mỗi Ngọn Lửa +50. Bỏ thưởng thời gian (`per_second_left: 0`).

### 4. Sức chứa tăng dần
`capacity = min(20, 10 + 2 × successful_lights)`. Đếm cả thắp lại, không đếm đèn đặt sẵn bằng scenario, và đặt lại mỗi Đêm (vì mỗi `Game` là một Đêm).

## Hệ quả
- Test cũ C10/C11 ("thắng ngay khi đủ đèn") bị **thay** bằng C10 (đủ đèn không kết thúc Đêm) và C11 (thắng lúc bình minh). Các test khác đổi số theo luật mới, có chú thích lý do. Không test nào bị skip.
- Bot trong `npm run proof` được dạy châm dầu và thắp lại.
- Giao diện: thanh dầu trên đèn, nhấp nháy 1 Hz khi < 30, đèn tắt xẹp 20% và có vết rách, HUD hiện `mang/sức chứa` và `đèn sáng/cần`.
