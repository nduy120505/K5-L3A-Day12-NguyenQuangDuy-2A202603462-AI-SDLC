# Bằng chứng phase-2 (tự sinh bởi `npm run proof`)

Sinh lúc: 2026-11-20T08:26:21.244Z · Node v24.13.1 · win32
Tuning dùng: `game.contract.json` (contract 1.1).

## 1. Test tự động (35 đạt / 0 trượt)
Toàn văn: [test-output.txt](test-output.txt). Test chạy **CLI headless thật** giống cách giảng viên chấm.

## 2. Bot chơi trọn từng Đêm (input ghi lại → phát lại qua CLI headless)
Bot tham lam: gom đom đóm gần nhất → về đèn chưa thắp gần nhất → interact; né Bóng Mực trong 6 m, tỏa sáng/lướt khi bị áp sát.
Đêm 2 đi qua cầu; Đêm 3 leo dốc 30°/150° và dùng bục nhảy lên tầng 2. Bot **không** né khéo, nên thua cũng là kết quả thật.

| đêm | seed | exit | kết quả | lý do | tick | điểm | đom đóm | đèn | bị chạm | tỏa sáng | bị cướp | output |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 0 | won | all_lit | 14733 | 1233 | 60 | 5/5 | 1 | 3 | 0 | [jsonl](bot-n1-s1.jsonl) |
| 1 | 2 | 0 | lost | dawn | 18000 | 200 | 18 | 1/5 | 1 | 1 | 0 | [jsonl](bot-n1-s2.jsonl) |
| 1 | 3 | 0 | lost | no_flames | 10346 | 810 | 55 | 4/5 | 3 | 1 | 0 | [jsonl](bot-n1-s3.jsonl) |
| 2 | 1 | 0 | lost | dawn | 19800 | 605 | 49 | 3/6 | 1 | 3 | 0 | [jsonl](bot-n2-s1.jsonl) |
| 2 | 2 | 0 | lost | dawn | 19800 | 210 | 23 | 1/6 | 0 | 1 | 0 | [jsonl](bot-n2-s2.jsonl) |
| 2 | 3 | 0 | lost | dawn | 19800 | 605 | 52 | 3/6 | 2 | 3 | 0 | [jsonl](bot-n2-s3.jsonl) |
| 3 | 1 | 0 | lost | no_flames | 6934 | 65 | 27 | 0/7 | 3 | 7 | 0 | [jsonl](bot-n3-s1.jsonl) |
| 3 | 2 | 0 | lost | no_flames | 7664 | 220 | 20 | 1/7 | 3 | 3 | 0 | [jsonl](bot-n3-s2.jsonl) |
| 3 | 3 | 0 | lost | no_flames | 2458 | 15 | 10 | 0/7 | 3 | 3 | 0 | [jsonl](bot-n3-s3.jsonl) |

## 3. Tính tất định
Hai lần chạy Đêm 2, cùng seed 1 + cùng inputs của bot: giống hệt nhau = **true** (sha256 eec88628c35915a6 / eec88628c35915a6).

## 4. Xử lý lỗi
| Trường hợp | Mã thoát | stderr |
|---|---|---|
| inputs tick giảm | 2 | `error: inputs.frames[1].tick: ticks must be strictly increasing` |
| scenario JSON hỏng | 2 | `error: scenario: invalid JSON (Expected property name or '}' in JSON at position 1 (line 1 column 2))` |
| thiếu --out | 1 | `error: --out <file.jsonl> is required` |

## 5. Tốc độ
Đêm 3 trọn 21 600 tick (bất tử để chạy hết) chạy headless trong **425 ms** (gồm khởi động Node).
