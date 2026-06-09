# GenPlayer — Chia 2 đội bóng sân 7 cân bằng

Công cụ chia **20 cầu thủ** thành **2 đội cân bằng nhất** cho bóng đá sân 7, kèm sơ đồ thi đấu trực quan (HTML) và phân tích ưu/nhược điểm.

🌐 **Xem trực tiếp:** https://toestuyen.github.io/GenPlayer/ *(tự cập nhật mỗi khi push, F5 để xem)*

## Cách hoạt động
- Mỗi cầu thủ được chấm **9 tiêu chí** (thang 1–10): **KT** kỹ thuật, **CH** chuyền, **DĐ** dứt điểm, **PN** phòng ngự, **TC** tốc độ, **TL** thể lực, **ĐN** độ nhiệt (chịu chạy), **TD** tư duy, **TM** thủ môn.
- **6 vị trí**: GK (thủ môn), Thòng (trung vệ), HV (hậu vệ biên), TVtt (tiền vệ trung tâm), TV (tiền vệ cánh), TĐ (tiền đạo).
- Chấm bởi **3 người** (Tuyên/Mạnh/Nam) → lấy trung bình để khách quan.
- Optimizer **duyệt toàn bộ C(19,9) = 92.378 cách chia**, mỗi đội gán vị trí tối ưu bằng thuật toán Hungarian, chọn cách **cân nhất** (cân: tổng điểm, ngôi sao, phòng ngự, hàng công, tốc độ, độ nhiệt, thủ môn, **cả đội hình chính lẫn dự bị**).

## Cấu trúc
```
GenPlayer/
├── index.html            # OUTPUT — trang web (GitHub Pages phục vụ); sinh ra, đừng sửa tay
├── build_web.py          # build: src/ + điểm-từ-DB → index.html
├── firebase_config.json  # cấu hình Firebase (bake vào index.html lúc build)
├── README.md
├── src/                  # NGUỒN (sửa ở đây rồi build lại)
│   ├── web_template.html #   giao diện + bộ vẽ sơ đồ
│   └── optimizer.js      #   thuật toán chia đội (duyệt toàn bộ + Hungarian)
└── assets/
    └── banner.jpg        # ảnh banner đầu trang
```

- **`index.html`** = trang web có nút "Tạo 2 đội" — chọn người có mặt → chia đội ngay trong trình duyệt (không cần server/AI). Là **output**, sinh bởi `build_web.py`.
- Sửa giao diện/thuật toán → sửa trong **`src/`** rồi chạy lại `build_web.py`.

## Chạy
Điểm cầu thủ **sống trong Firestore DB** (sửa ngay trên web ở mục "Cầu thủ" → tự lưu cloud). `build_web.py` đọc điểm mới nhất **từ DB** để sinh lại trang — không còn file Excel nào.
```bash
python3 build_web.py      # đọc điểm từ Firestore → sinh index.html (mở bằng trình duyệt)
```
Mở `index.html` → tick người có mặt → bấm **Tạo 2 đội**. Mọi tính toán chạy trong trình duyệt.

## Yêu cầu
Python 3 (chỉ dùng thư viện chuẩn) · trang web không cần cài gì.
