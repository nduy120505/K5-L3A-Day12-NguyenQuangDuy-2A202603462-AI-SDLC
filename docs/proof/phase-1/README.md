# Bằng chứng phase-1 (tự sinh bởi `npm run proof`)

Sinh lúc: 2026-11-20T07:40:04.809Z · Node v24.13.1 · win32
Tuning dùng: `game.contract.json` (contract 1.0).

## 1. Test tự động (17 đạt / 0 trượt)
Toàn văn: [test-output.txt](test-output.txt). Test chạy **CLI headless thật** giống cách giảng viên chấm.

## 2. Chơi trọn Đêm 1 bằng bot (input ghi lại → phát lại qua CLI headless)
Bot tham lam: gom đom đóm gần nhất → về đèn chưa thắp gần nhất → nhấn interact; tỏa sáng khi Bóng Mực < 3 m.

| seed | exit | kết quả | lý do | tick kết thúc | điểm | đom đóm | đèn thắp | bị chạm | tỏa sáng | Bóng Mực sinh thêm | output |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 0 | won | all_lit | 2770 | 1466 | 27 | 5 | 0 | 1 | 1 | [jsonl](bot-seed1.jsonl) |
| 2 | 0 | won | all_lit | 4484 | 1640 | 44 | 5 | 2 | 8 | 2 | [jsonl](bot-seed2.jsonl) |
| 3 | 0 | won | all_lit | 2757 | 1538 | 32 | 5 | 0 | 3 | 1 | [jsonl](bot-seed3.jsonl) |

## 3. Tính tất định
Hai lần chạy cùng seed 1 + cùng inputs: giống hệt nhau = **true** (sha256 70e5272dd4b0443d / 70e5272dd4b0443d).

## 4. Xử lý lỗi
| Trường hợp | Mã thoát | stderr |
|---|---|---|
| inputs tick giảm | 2 | `error: inputs.frames[1].tick: ticks must be strictly increasing` |
| scenario JSON hỏng | 2 | `error: scenario: invalid JSON (Expected property name or '}' in JSON at position 1 (line 1 column 2))` |
| thiếu --out | 1 | `error: --out <file.jsonl> is required` |

## 5. Tốc độ
18 000 tick (= 300 s, trọn một đêm) chạy headless trong **58 ms** (gồm khởi động Node).
