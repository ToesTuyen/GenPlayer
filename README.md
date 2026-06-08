# GenPlayer — Chia 2 đội bóng sân 7 cân bằng

Công cụ chia **20 cầu thủ** thành **2 đội cân bằng nhất** cho bóng đá sân 7, kèm sơ đồ thi đấu trực quan (HTML) và phân tích ưu/nhược điểm.

🌐 **Xem trực tiếp:** https://toestuyen.github.io/GenPlayer/ *(tự cập nhật mỗi khi push, F5 để xem)*

## Cách hoạt động
- Mỗi cầu thủ được chấm **9 tiêu chí** (thang 1–10): **KT** kỹ thuật, **CH** chuyền, **DĐ** dứt điểm, **PN** phòng ngự, **TC** tốc độ, **TL** thể lực, **ĐN** độ nhiệt (chịu chạy), **TD** tư duy, **TM** thủ môn.
- **6 vị trí**: GK (thủ môn), Thòng (trung vệ), HV (hậu vệ biên), TVtt (tiền vệ trung tâm), TV (tiền vệ cánh), TĐ (tiền đạo).
- Chấm bởi **3 người** (Tuyên/Mạnh/Nam) → lấy trung bình để khách quan.
- Optimizer **duyệt toàn bộ C(19,9) = 92.378 cách chia**, mỗi đội gán vị trí tối ưu bằng thuật toán Hungarian, chọn cách **cân nhất** (cân: tổng điểm, ngôi sao, phòng ngự, hàng công, tốc độ, độ nhiệt, thủ môn, **cả đội hình chính lẫn dự bị**).

## Cấu trúc
| File | Vai trò |
|---|---|
| **`index.html`** | **Trang web có nút "Tạo 2 đội"** — chọn người có mặt → chia đội ngay trong trình duyệt (không cần server/AI) |
| `optimizer.js` | Thuật toán chia đội bằng JavaScript (duyệt toàn bộ + Hungarian) |
| `build_web.py` | Ghép `web_template.html` + `optimizer.js` + điểm (xlsx) → `index.html` |
| `web_template.html` | Giao diện + bộ vẽ sơ đồ của trang web |
| `build_xlsx.py` | Tạo template chấm điểm `BangDanhGia_CauThu.xlsx` (⚠️ chạy lại sẽ xoá điểm) |
| `fill_tuyen.py` | Quy đổi đánh giá (trình độ + vị trí + tốc độ + độ nhiệt) → 9 điểm; có `OVERRIDES` để chỉnh tay |
| `team_builder.py` | Bản Python đối chiếu (in ra console + `preview_static.html`) |
| `BangDanhGia_CauThu.xlsx` | Bảng chấm điểm (3 người chấm) |
| `HuongDan_ChamDiem.md` | Hướng dẫn cho người chấm |

## Chạy
```bash
pip install openpyxl numpy scipy
python3 build_xlsx.py     # tạo template chấm điểm (1 lần)
python3 fill_tuyen.py     # nhập/cập nhật điểm cầu thủ
python3 build_web.py      # sinh trang web index.html (mở bằng trình duyệt)
```
Mở `index.html` → tick người có mặt → bấm **Tạo 2 đội**. Mọi tính toán chạy trong trình duyệt.

## Yêu cầu
Python 3 · `openpyxl`, `numpy`, `scipy` *(numpy/scipy chỉ cần cho bản Python đối chiếu; trang web không cần gì)*
