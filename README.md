# Đảo Đèn Lồng

> **Video demo:** _(sẽ thêm ở Phase 4)_ · **Bằng chứng:** [Phase 1](docs/proof/phase-1/README.md) · [Phase 2](docs/proof/phase-2/README.md) · [Phase 3](docs/proof/phase-3/README.md) · **Spec Phase 2:** [docs/notes/spec-phase2.md](docs/notes/spec-phase2.md) · **ADR:** [0001 đèn có dầu](docs/adr/0001-lantern-fuel-and-dawn-win.md) · [CHANGELOG](CHANGELOG.md) · Tài liệu lab gốc: [docs/lab/](docs/lab/README.md)

Game 3D góc nhìn thứ ba. **Mây**, người giữ đèn nhỏ tuổi đội nón lá, gom đom đóm để thắp lại các **Đèn Lồng Lớn** qua **3 Đêm**: Đảo Bến (5 đèn), Đảo Cau (2 đảo nối bằng cầu tre, 6 đèn) và Đảo Chuông (3 tầng, 7 đèn, có gió mạnh). Trên đường đi phải né và xua **Bóng Mực** trong sương đen, giữ đom đóm khỏi **Gió Lạc**, và nhặt **Bùa Gió**.

Cá nhân · MSSV 2A202603462 · Nguyễn Quang Duy · Lab Day 12 AI SDLC.

## Cài đặt và chạy (macOS / Linux / Windows, cần Node ≥ 18)

```bash
npm install      # không có dependency, chỉ kiểm tra môi trường
npm start        # mở http://localhost:5173 trên trình duyệt
```

Game là trang web tĩnh. three.js 0.170.0 đã được đóng gói sẵn trong `vendor/`, nên **chạy offline được**, không cần Internet.

## Điều khiển

| Phím | Hành động |
|---|---|
| `W A S D` / `↑ ↓` | Đi (theo hướng camera) |
| Kéo chuột / `← →` | Xoay camera (chỉnh độ nhạy trong Cài đặt) |
| `Space` | Nhảy |
| `Shift` | Lướt |
| `E` | Nạp ánh sáng vào đèn ở gần |
| `F` | Tỏa sáng: xua Bóng Mực, tốn 3 đom đóm |
| `Esc` / `P` | Tạm dừng: Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu |
| `Enter` | Xác nhận màn giới thiệu và màn kết quả |

## Luật chơi và cách tính điểm (Ticket-03, contract v1.2)

**Mục tiêu: giữ đảo sáng tới bình minh.** Mỗi đèn sáng có **dầu 100**, hao 1/s. Bấm `E` ở đèn đang sáng để châm (+10 dầu mỗi đom đóm). Hết dầu thì đèn tắt; thắp lại chỉ cần 5. Đèn dưới 30 dầu nhấp nháy, mất vùng an toàn, và Bóng Mực sẽ tới hút dầu. Khi hết giờ, cần ít nhất **60% đèn đang sáng** (3/5, 4/6, 5/7) để thắng. Sức chứa tăng thêm 2 sau mỗi lần thắp thành công (tối đa 20).


- Tự nhặt đom đóm khi ở trong 1.0 m (chênh cao ≤ 1.5 m), mang tối đa **10**. Mỗi đèn cần **10**, nạp nhiều lần được.
- Đèn đã thắp tạo vùng an toàn bán kính **6 m**, Bóng Mực không vào được.
- Bóng Mực (4 m/s, 4.5 m/s ở Đêm 3) chạm vào Mây: −1 Ngọn Lửa (có 3), rơi một nửa đom đóm xuống quanh chân, bất tử 1.5 s.
- Tỏa sáng: tốn 3, choáng Bóng Mực trong 5 m trong 2 s và đẩy chúng lùi 4 m; hồi chiêu 3 s. Lướt: 14 m/s trong 0.2 s, hồi chiêu 1.5 s.
- Rơi khỏi đảo: −1 Ngọn Lửa, mất hết đom đóm, hồi sinh ở điểm xuất phát.
- Gió Lạc cướp 3 đom đóm khi Mây mang ≥ 5. Tỏa sáng vào nó để lấy lại.
- **Thắng** khi bình minh tới (240 / 270 / 300 s) mà đủ ≥ 60% đèn sáng. **Thua** khi hết lửa, hoặc bình minh mà thiếu đèn.

| Sự kiện | Điểm |
|---|---|
| Mỗi đom đóm nạp vào đèn (thắp, thắp lại, châm dầu) | +5 |
| Thắp lần đầu / thắp lại | +100 / +40 |
| Bóng Mực trúng Tỏa sáng (đang hút dầu) | +5 (+15) |
| Bình minh (khi thắng): mỗi đèn sáng / mỗi Ngọn Lửa | +50 + floor(dầu) / +50 |

Tổng điểm là tổng điểm các Đêm đã thắng. Mọi con số lấy từ [game.contract.json](game.contract.json) (contract **v1.2**); bản đồ chuẩn nằm trong [src/core/maps.js](src/core/maps.js). Giả định ở [docs/notes/assumptions.md](docs/notes/assumptions.md).

## Chế độ headless (Test Contract v1.0)

```bash
node src/headless.js --seed 1 --night 1|2|3 --ticks 600 --out out.jsonl \
     [--scenario scenario.json] [--inputs inputs.json] [--snapshot-every 10]
```

- Chạy cùng mã logic với game có giao diện (`src/core/`), không cần cửa sổ hay GPU. Một Đêm 3 đầy đủ (21 600 tick) chạy khoảng 0.3 s.
- Tất định: cùng seed, scenario và inputs thì output giống hệt nhau.
- Mã thoát: `0` khi chạy xong, `2` khi file inputs/scenario sai định dạng, `1` khi gọi sai tham số.
- Có tạm dừng (`pause`), lướt (`dash`), Gió Lạc, Bùa Gió và gió theo Test Contract v1.1.

## Test và bằng chứng

```bash
npm test         # 47 test (hồi quy, Phase 2, Phase 3), chạy CLI headless thật
npm run proof -- phase-3   # sinh docs/proof/phase-3/ (test, bot chơi 3 Đêm, tất định, mã lỗi, tốc độ)
```

## Cấu trúc

```text
game.contract.json   tuning + lệnh (nguồn số liệu duy nhất)
src/core/            logic thuần (game.js, maps.js, rng.js, validate.js), không phụ thuộc DOM
src/headless.js      CLI theo Test Contract
src/main.js          luồng UI 3 Đêm, HUD, input, chỉ đọc state
src/render/          world.js (địa hình, bảng màu), audio.js (âm thanh WebAudio)
index.html           trang game
scripts/             serve.js (server tĩnh), proof.js (sinh bằng chứng)
tests/               test chấp nhận
docs/notes/          giả định, nhật ký AI, retro
docs/proof/          bằng chứng từng phase
CLAUDE.md            harness cho agent; .claude/skills/proof = quy trình sinh bằng chứng
```

## Sáng tạo của tôi

Tất cả chỉ nằm ở lớp hiển thị (`src/main.js`), **không** đổi state hay output headless. Bằng chứng là cùng 17 test và cùng hash tất định ở [docs/proof/phase-1](docs/proof/phase-1/README.md).

- **Đèn lồng trên nón lá phản ánh ánh sáng đang mang:** càng mang nhiều đom đóm, đèn của Mây càng sáng.
- **Đèn trời:** mỗi khi một Đèn Lồng Lớn được thắp, vài chiếc đèn trời nhỏ bay lên bầu trời.
- **Đảo ấm dần lên:** sương tan bớt, trời ấm dần theo số đèn đã thắp (ánh sáng môi trường theo đúng công thức chuẩn).
- **Lời Ông Đăng** cho từng Đêm, lá bay báo trước gió, Gió Lạc là dải lụa uốn lượn, Bùa Gió đỏ viền vàng xoay tròn.
- **Chế độ mù màu** (Cài đặt → Bảng màu dễ phân biệt); đèn tắt xẹp xuống và có vết rách giấy.
- **Âm thanh tổng hợp bằng WebAudio** (nhạc ngũ cung ban đêm), không dùng file ngoài.
- Vòng sáng vàng trên mặt đất cho thấy vùng an toàn quanh đèn đã thắp.
- Gợi ý theo ngữ cảnh ("Nhấn E để nạp...") và màn mở đầu có lời dẫn truyện.

## Giấy phép

Mã nguồn dùng [MIT](LICENSE). Nguồn tham khảo ghi trong [CREDITS.md](CREDITS.md).
