# Retro: Đảo Đèn Lồng (4 phase, 4 giờ)

## 1. Evaluation theo phase

| Phase | Kết quả | Bằng chứng | Chưa đạt / rủi ro |
|---|---|---|---|
| 1: PRD-0 | Đêm 1 chơi được; headless theo contract 1.0 | 17 test CLI; bot thắng 3/3 seed; tất định | Chưa chơi tay phần 3D trước khi tag |
| 2: Ba hòn đảo | Số chuẩn, 3 bản đồ, lướt, rơi, tạm dừng, Gió Lạc, Bùa Gió, gió, chuỗi 3 Đêm, cài đặt, âm thanh, HUD | 35 test (≥ 1 scenario cho mỗi tính năng); bot 1/9 thắng | Điểm xuất phát Đêm 3 là giả định (0,0,−30); UI chỉ được kiểm tra tự động ở Phase 4 |
| 3: Đèn cạn dầu | Dầu, `drain`, thắp lại, thắng lúc bình minh, sức chứa, điểm mới, chế độ mù màu | 47 test; ADR 0001; CHANGELOG | Bot thua 9/9 theo luật mới (bot yếu, không phải lỗi luật); có lượt bot dường như bị kẹt, chưa tìm ra lý do |
| 4: Phát hành | Bench, soak, bảng xếp hạng, dễ tiếp cận, đóng gói | 53 test; bench.json (154 / 64 FPS); soak.json (0 crash, ×1.13); Playwright UI check (0 lỗi) + ảnh | `peak_mem_mb = null` (bản web); FPS ở máy chấm có thể khác |

## 2. Điều gì hiệu quả khi làm với AI
- **Viết test trước, chạy CLI thật.** Mọi test gọi `node src/headless.js` giống cách giảng viên chấm. Vì vậy "agent bảo chạy rồi" không bao giờ là bằng chứng: chỉ test xanh mới tính.
- **Tách `src/core/` thuần JS.** Trình duyệt, headless, soak, bench và bot dùng cùng một mã. Khi luật đổi ở Phase 2 và 3, chỉ một chỗ phải sửa.
- **Một nguồn số liệu** (`game.contract.json`). Phase 2 thay toàn bộ tuning mà không phải lùng số rải trong code.
- **Đọc thứ tự xử lý trong tick thành code đúng 12 bước.** Nhờ vậy những ca khó (dầu bị trừ trước bước tương tác, đèn đầy vẫn nhận 1 đom đóm) đi đúng spec.
- **Playwright ở Phase 4** vừa đo bench, vừa lần đầu chạy được giao diện tự động: đi qua menu, 3 Đêm, cài đặt, bảng xếp hạng, có ảnh và bắt mọi lỗi JS.

## 3. Điều không hiệu quả
- UI ở Phase 2–3 chỉ được kiểm tra cú pháp. Kiểm tra UI tự động có lẽ nên làm từ Phase 2.
- Bot proof quá ngây thơ: thắng 3/3 ở Phase 1, nhưng thua gần hết khi luật khó lên. Bot yếu làm bằng chứng "chơi được tới thắng" kém thuyết phục hơn.
- Vá file bằng script Python trong heredoc bash hai lần lỗi trích dẫn (`\n`, dấu nháy), tốn vài lượt gọi.

## 4. Những lần AI sai và cách phát hiện
| Lần | Sai | Phát hiện bởi |
|---|---|---|
| P1 | Choáng ngắn 1 tick (trừ bộ đếm trong tick tỏa sáng); Bóng Mực đặt trong vùng an toàn không bị đẩy | Test C11/C14 |
| P2 | Nhảy dùng Euler nên chạm đất trễ 2 tick so với 0.7 s; recoil thiếu 1 bước; Gió Lạc `idle` bị Tỏa Sáng làm bỏ chạy | Test C5, C14, đọc lại spec |
| P2–P3 | 8 test do AI viết sai spec (làm tròn −10.0003, quên dầu bị hút trong cùng tick, Bóng Mực không kịp chạm Mây…) | Test đỏ, sau đó đối chiếu spec và sửa **test**, ghi lý do |
| P4 | Bench lần đầu p1_low 23.7 < 30 (1400 lệnh vẽ, cấp phát mỗi khung, CDP polling); soak có lần 1.22 > 1.2 | Chạy bench và soak thật, chạy lặp nhiều lần |
| P4 | Chuỗi lệnh `npm test \| grep && git commit` vẫn commit khi có test đỏ (grep trả 0) | Đọc output; đã sửa ngay ở commit sau |

## 5. Harness giúp nhiều nhất
- **CLAUDE.md** (khoảng 20 dòng): kiến trúc bắt buộc (core thuần, 12 bước/tick, một nguồn tuning, RNG có seed) và quy tắc "sửa test phải ghi lý do". Được cập nhật mỗi phase.
- **Skill `proof`**: quy trình sinh bằng chứng trước khi tag, không sửa tay output.
- **Bộ test CLI** là harness hiệu quả nhất. Nó đóng vai một "reviewer" tự động và bắt được hết các lỗi ở mục 4.
- Chưa dùng hook. Nếu làm lại, tôi sẽ thêm hook chạy `npm test` trước khi commit để chặn đúng lỗi ở dòng cuối mục 4.

## 6. Token và chi phí
| Phase | Ước tính | Cách tiết kiệm |
|---|---|---|
| 1–4 | _điền từ lệnh `/cost` của Claude Code_ (một phiên duy nhất, model Opus) | Một agent, không subagent; đọc tài liệu một lần; vá có mục tiêu thay vì viết lại cả file; test CLI thay cho vòng thử-sai bằng tay; không dependency (ít ngữ cảnh) |

## 7. Nếu làm lại
1. Dựng Playwright UI check ngay từ Phase 1–2, chụp ảnh mỗi phase.
2. Thêm hook pre-commit `npm test`.
3. Viết bot có tìm đường (A* đơn giản trên lưới) và chiến thuật giữ đèn, để bằng chứng "thắng được" mạnh hơn.
4. Hỏi trợ giảng sớm các điểm mơ hồ có thể ảnh hưởng test ẩn, như điểm xuất phát Đêm 3 và kiểu của `invuln`.
