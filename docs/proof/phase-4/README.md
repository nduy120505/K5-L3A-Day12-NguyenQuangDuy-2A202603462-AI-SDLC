# Bằng chứng phase-4 (tự sinh bởi `npm run proof`)

Sinh lúc: 2026-11-20T09:56:10.716Z · Node v24.13.1 · win32
Tuning dùng: `game.contract.json` (contract 1.3).

## 1. Test tự động (53 đạt / 0 trượt)
Toàn văn: [test-output.txt](test-output.txt). Test chạy **CLI headless thật** giống cách giảng viên chấm.

## 2. Bot chơi trọn từng Đêm (input ghi lại → phát lại qua CLI headless)
Bot tham lam: gom đom đóm gần nhất → về đèn chưa thắp gần nhất → interact; né Bóng Mực trong 6 m, tỏa sáng/lướt khi bị áp sát.
Đêm 2 đi qua cầu; Đêm 3 leo dốc 30°/150° và dùng bục nhảy lên tầng 2. Bot **không** né khéo, nên thua cũng là kết quả thật.

| đêm | seed | exit | kết quả | lý do | tick | điểm | đom đóm | đèn | bị chạm | tỏa sáng | bị cướp | output |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 0 | lost | dawn | 14400 | 150 | 16 | 1/5 | 0 | 0 | 0 | [jsonl](bot-n1-s1.jsonl) |
| 1 | 2 | 0 | lost | dawn | 14400 | 755 | 59 | 6/5 | 0 | 1 | 0 | [jsonl](bot-n1-s2.jsonl) |
| 1 | 3 | 0 | lost | dawn | 14400 | 150 | 12 | 1/5 | 0 | 0 | 0 | [jsonl](bot-n1-s3.jsonl) |
| 2 | 1 | 0 | lost | no_flames | 6697 | 5 | 33 | 0/6 | 3 | 5 | 0 | [jsonl](bot-n2-s1.jsonl) |
| 2 | 2 | 0 | lost | no_flames | 6500 | 165 | 32 | 1/6 | 3 | 1 | 0 | [jsonl](bot-n2-s2.jsonl) |
| 2 | 3 | 0 | lost | dawn | 16200 | 305 | 31 | 2/6 | 1 | 1 | 0 | [jsonl](bot-n2-s3.jsonl) |
| 3 | 1 | 0 | lost | no_flames | 6304 | 20 | 23 | 0/7 | 3 | 4 | 0 | [jsonl](bot-n3-s1.jsonl) |
| 3 | 2 | 0 | lost | no_flames | 14585 | 365 | 45 | 3/7 | 3 | 2 | 0 | [jsonl](bot-n3-s2.jsonl) |
| 3 | 3 | 0 | lost | no_flames | 11006 | 205 | 33 | 1/7 | 3 | 5 | 0 | [jsonl](bot-n3-s3.jsonl) |

## 3. Tính tất định
Hai lần chạy Đêm 2, cùng seed 1 + cùng inputs của bot: giống hệt nhau = **true** (sha256 366acde91a90c339 / 366acde91a90c339).

## 4. Xử lý lỗi
| Trường hợp | Mã thoát | stderr |
|---|---|---|
| inputs tick giảm | 2 | `error: inputs.frames[1].tick: ticks must be strictly increasing` |
| scenario JSON hỏng | 2 | `error: scenario: invalid JSON (Expected property name or '}' in JSON at position 1 (line 1 column 2))` |
| thiếu --out | 1 | `error: --out <file.jsonl> is required` |

## 5. Tốc độ
Đêm 3 trọn 21 600 tick (bất tử để chạy hết) chạy headless trong **386 ms** (gồm khởi động Node).

## 6. Phase 4: số đo phát hành
| Hạng mục | Kết quả | Ngưỡng | File |
|---|---|---|---|
| Bench `avg_fps` / `p1_low_fps` / `frame_ms_p95` / `load_ms` | 154.1 / 64.3 / 10.4 ms / 1165 ms | ≥ 60 / ≥ 30 / – / ≤ 10 000 | [bench.json](../../../bench.json) |
| Soak 10 Đêm: crashes, mem_end/mem_start | 0 · 51.7/45.9 = 1.13 | 0 · ≤ 1.2 | [soak.json](../../../soak.json) |
| UI tự động (menu, 3 Đêm, tạm dừng, cài đặt và đổi phím, thua, nhập tên, bảng xếp hạng, xuất) | 0 lỗi JS | 0 | [ui-check.md](ui-check.md), [screens/](screens/) |

Máy đo: Intel i7-8665U, Intel UHD Graphics 620, 16 GB RAM, Windows 11, Chromium (Playwright 1.48.2) có cửa sổ, vsync tắt. Số trên máy chấm sẽ khác.
Ghi chú tối ưu: lần bench đầu p1_low = 23.7 (trượt). Sau khi render bằng InstancedMesh, cache HUD và bỏ cấp phát mỗi khung thì lên 64.3.
