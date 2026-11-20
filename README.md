# Đảo Đèn Lồng

> **Video demo:** _(sẽ thêm ở Phase 4)_ · **Bằng chứng Phase 1:** [docs/proof/phase-1/](docs/proof/phase-1/README.md) · Tài liệu lab gốc: [docs/lab/](docs/lab/README.md)

Game 3D góc nhìn thứ ba. **Mây**, người giữ đèn nhỏ tuổi đội nón lá, gom đom đóm khắp **Đảo Bến** để thắp lại **5 Đèn Lồng Lớn** trước bình minh, đồng thời né và xua **Bóng Mực** trong sương đen.

Cá nhân · MSSV 2A202603462 · Nguyễn Quang Duy · Lab Day 12 AI SDLC.

## Cài đặt và chạy (macOS / Linux / Windows, cần Node ≥ 18)

```bash
npm install      # không có dependency, chỉ kiểm tra môi trường
npm start        # mở http://localhost:5173 trên trình duyệt
```

Game là trang web tĩnh, dùng three.js 0.170.0 tải từ CDN jsDelivr nên **cần Internet** khi mở game. Chế độ headless và test **không** cần mạng.

## Điều khiển

| Phím | Hành động |
|---|---|
| `W A S D` / `↑ ↓` | Đi (theo hướng camera) |
| Kéo chuột / `← →` | Xoay camera |
| `Space` | Nhảy |
| `E` | Nạp ánh sáng vào đèn ở gần |
| `F` | Tỏa sáng: xua Bóng Mực ở gần, tốn ánh sáng |
| `R` / `Enter` | Chơi lại |

## Luật chơi và cách tính điểm

- Đi gần đom đóm (≤ 1.2 m) là tự nhặt, mang tối đa **10**.
- Đứng gần đèn (≤ 2.5 m) và bấm `E` để nạp. Mỗi đèn cần **5** ánh sáng, nạp được nhiều lần.
- Đèn đã thắp tạo **vùng an toàn bán kính 6 m**: Bóng Mực không vào được.
- Bóng Mực đuổi theo Mây (3.5 m/s, Mây đi 6 m/s). Bị chạm thì mất **1 ngọn lửa** (có 3), rơi **50%** ánh sáng đang mang và bất tử 1.5 s.
- Tỏa sáng tốn **2** ánh sáng, làm choáng mọi Bóng Mực trong 6 m trong 3 s và đẩy chúng ra xa 4 m. Hồi chiêu 1.5 s.
- **Thắng:** thắp đủ 5 đèn. **Thua:** hết ngọn lửa, hoặc trời sáng (300 s) mà chưa thắp xong.

| Sự kiện | Điểm |
|---|---|
| Nhặt 1 đom đóm | +10 |
| Thắp 1 đèn | +100 |
| Mỗi Bóng Mực bị choáng bởi một lần tỏa sáng | +20 |
| Khi thắng: mỗi giây còn lại (làm tròn xuống) | +2 |
| Khi thắng: mỗi ngọn lửa còn lại | +50 |

Mọi con số trên lấy từ một nguồn duy nhất là [game.contract.json](game.contract.json). Giải thích chi tiết từng con số ở [docs/notes/assumptions.md](docs/notes/assumptions.md).

## Chế độ headless (Test Contract v1.0)

```bash
node src/headless.js --seed 1 --night 1 --ticks 600 --out out.jsonl \
     [--scenario scenario.json] [--inputs inputs.json] [--snapshot-every 10]
```

- Chạy cùng mã logic với game có giao diện (`src/core/`), không cần cửa sổ hay GPU. Một đêm 18 000 tick chạy khoảng 60 ms.
- Tất định: cùng seed, scenario và inputs thì output giống hệt nhau.
- Mã thoát: `0` khi chạy xong, `2` khi file inputs/scenario sai định dạng, `1` khi gọi sai tham số.
- Không có rơi khỏi đảo (`fall_enabled: false`): mép đảo là tường mềm.

## Test và bằng chứng

```bash
npm test         # 17 test chấp nhận, chạy CLI headless thật
npm run proof    # sinh lại docs/proof/phase-1/ (test, bot chơi trọn đêm, tất định, mã lỗi, tốc độ)
```

## Cấu trúc

```text
game.contract.json   tuning + lệnh (nguồn số liệu duy nhất)
src/core/            logic thuần (game.js, rng.js, validate.js), không phụ thuộc DOM
src/headless.js      CLI theo Test Contract
src/main.js          hiển thị three.js + HUD, chỉ đọc state
index.html           trang game
scripts/             serve.js (server tĩnh), proof.js (sinh bằng chứng)
tests/               test chấp nhận
docs/notes/          giả định, nhật ký AI, retro
docs/proof/          bằng chứng từng phase
CLAUDE.md            harness cho agent
```

## Sáng tạo của tôi

Tất cả chỉ nằm ở lớp hiển thị (`src/main.js`), **không** đổi state hay output headless. Bằng chứng là cùng 17 test và cùng hash tất định ở [docs/proof/phase-1](docs/proof/phase-1/README.md).

- **Đèn lồng trên nón lá phản ánh ánh sáng đang mang:** càng mang nhiều đom đóm, đèn của Mây càng sáng.
- **Đèn trời:** mỗi khi một Đèn Lồng Lớn được thắp, vài chiếc đèn trời nhỏ bay lên bầu trời.
- **Đảo ấm dần lên:** sương tan bớt, trời, cỏ và biển mây chuyển từ tím đen sang ấm theo số đèn đã thắp.
- Vòng sáng vàng trên mặt đất cho thấy vùng an toàn quanh đèn đã thắp.
- Gợi ý theo ngữ cảnh ("Nhấn E để nạp...") và màn mở đầu có lời dẫn truyện.

## Giấy phép

Mã nguồn dùng [MIT](LICENSE). Nguồn tham khảo ghi trong [CREDITS.md](CREDITS.md).
