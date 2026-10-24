# GenPlayer — Chia 2 đội bóng sân 7 cân bằng

Công cụ chia **20 cầu thủ** thành **2 đội cân bằng nhất** cho bóng đá sân 7, kèm sơ đồ thi đấu trực quan (HTML) và phân tích ưu/nhược điểm.

## Web app + OpenRouter trực tiếp (branch `feat/web-app-openrouter`)

AI chạy **ngay trong trình duyệt → OpenRouter qua HTTPS**, không có backend AI/proxy hay API `/api/ai/*`. Mỗi người nhập key riêng trong popup khi vào Tạo đội; không nhúng key vào mã nguồn public. Thuật toán, Firebase, lịch sử và quyền quản lý trận được giữ nguyên. Bản GitHub Pages trên `main` chưa thay đổi.

### Nhập key và tạo đội

Vào **Tạo đội**: chưa có key thì popup **Kết nối OpenRouter** tự hiện. **Lưu key** đóng popup; **Bỏ qua, dùng thuật toán**, Esc hoặc × cũng đóng popup và xoá nội dung chưa lưu. Bỏ qua không gọi AI và không tự tạo đội: chọn người rồi bấm nút **Tạo đội** duy nhất để dùng thuật toán. Không hỏi lại khi bấm Tạo đội trong cùng màn; lần sau vào màn mà vẫn chưa có key thì nhắc lại. Có key đã lưu hoặc key tạm thì không tự hiện. Nút nhỏ **Key OpenRouter** mở lại để nhập/đổi/xoá key; không có nút hay lớp **Tuỳ chọn AI** hoặc form key dài trong danh sách.

Mặc định lưu key bằng localStorage trên đúng trình duyệt/origin, không đồng bộ sang máy khác. Bỏ chọn **Lưu trên trình duyệt này** nếu chỉ dùng tới khi tải lại/đóng trang. **Xoá key trên máy này** không thu hồi key tại OpenRouter hoặc huỷ lượt đã gửi. Ô nhập che key, xoá sau khi lưu/đóng và không tự điền lại; lỗi lưu hiển thị ngay trong popup. Lưu key và xem thông tin kết nối chỉ xử lý local, không gửi key hoặc kiểm tra provider. Chỉ lúc chạy AI mới có xác nhận gửi dữ liệu/tính phí theo key đó.

Key chỉ nằm trong storage riêng và header `Authorization` gửi thẳng tới `https://openrouter.ai/api/v1/chat/completions`, không đi qua máy chủ của app, không vào prompt, Git, HTML build, Firebase hay backup. Cách gọi dùng [Bearer token theo tài liệu OpenRouter](https://openrouter.ai/docs/api_reference/authentication).

**Cho phép nhập/lưu key cả trên link Wi-Fi HTTP.** Request API vẫn trực tiếp qua HTTPS, không gửi key tới máy chủ HTTP trên mạng nội bộ. Tuy nhiên trang HTTP có thể bị thay mã trên đường truyền; nên dùng bản online HTTPS. LocalStorage không phải kho bí mật tuyệt đối: script cùng origin/XSS, tiện ích có quyền hoặc người mở profile trình duyệt có thể đọc key. Các repo cùng origin không cách ly storage. Tránh máy dùng chung, đặt hạn mức cho từng key và thu hồi key từng lộ trong chat/log. Không dán key vào Note/nhận định.

### Luồng AI và tiêu chí

- **Chia đội 7 vs 7 (14–24 người)**: một nút **Tạo đội**. Có key thì trình duyệt chuẩn bị dữ liệu, gọi model và kiểm tra kết quả; thiếu key, lỗi mạng/CORS, key lỗi, timeout hoặc output không hợp lệ thì chuyển sang thuật toán Web Worker, không retry AI. Huỷ xác nhận gửi dữ liệu thì dừng, giữ bản nháp cũ.
- **12 tiêu chí và Note** luôn hiện trên danh sách. Cân riêng công/thủ, ưu tiên người mạnh/thành viên, vị trí phù hợp, chia khách/dự bị, xoay tua đội hình và xét phong độ. Note hiện tại là nguồn duy nhất cho yêu cầu riêng, không lấy lệnh trận cũ; không đưa Note vào nhận định public. Thuật toán chưa hiểu Note hoặc tối ưu lịch sử/phong độ nên có cảnh báo rõ. Sửa Note sau khi tạo báo bản nháp chưa cập nhật.
- **Tiến trình 11 bước** là kiểm tra thực tế, không giả lập suy nghĩ LLM; mỗi bước tối thiểu 1 giây, active ở trên cùng, đã chạy mới nhất trước rồi tới pending. Xong không tự đóng; **Xem tiêu chí** mở lại không gọi AI. Chênh tuyến trên 1.5 điểm tổng, trái vị trí, dự bị mạnh hơn, lặp đồng đội/vị trí đều cảnh báo; yêu cầu chưa xác minh không được tích xanh.
- **Nhận định trận**: ít nhất 6 phần về các tuyến, đối đầu, chuỗi kết quả, bàn thắng, dự bị và kết luận; trận có tỉ số phân tích kết quả đã biết. Dùng snapshot chỉ số trong trận. Admin lưu đúng trận qua transaction, từ chối nếu đội hình/tỉ số/bàn thắng đã đổi; không tạo trận mới.
- **Phong độ / đề xuất điểm**: 5 trận của đội, tính cả vắng mặt, có tăng/giữ/giảm/chưa đủ dữ liệu. Dưới 3 lần có mặt không đề xuất đổi điểm; không tự áp dụng.
- **Mô tả Cầu thủ nổi bật**: văn mới dựa vào chỉ số/phong độ gần đây; không meme, không dự báo, không tự đè mô tả.

Prompt chỉ lấy tên/chỉ số/vị trí, đội hình, kết quả, bàn thắng và Note liên quan; không lấy tài khoản, sổ quỹ hay từng người chấm. Bàn chưa khóa và thiếu phút ra sân dự bị được nêu rõ. Output được kiểm tra JSON/schema và tính lại điểm bằng code trước khi vẽ; nội dung AI luôn escape. Tạo nháp không tự lưu trận hoặc đổi điểm.

Cấu hình **public, không chứa key** nằm ở `src/ai_service.js` → `DEFAULTS`: model `openai/gpt-4.1-mini`, tối đa 5.000 output token, timeout 90 giây; model phải hỗ trợ [structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs). Không tự đổi model hay retry gây phí. Dữ liệu đầu vào tối đa 256 KB, phản hồi 512 KB. Không còn mật khẩu/phiên AI, giới hạn lượt chung ở server hoặc cấu hình key/model trong `.env`; hạn mức chi tiêu đặt tại OpenRouter.

### Chạy local và triển khai static

AI không cần Node ở môi trường triển khai. Để xem local an toàn, có máy chủ file tĩnh tuỳ chọn (Node >=18.20, Python 3 để build; không cần npm dependencies):

```bash
npm start  # offline build → dist/, phục vụ file tĩnh ở http://localhost:3000
npm test   # prompt/context, gọi trực tiếp, key, output, fallback và hồi quy UI
```

`scripts/serve_web.cjs` chỉ phục vụ HTML/assets theo allowlist, không xử lý AI, không nhận/chuyển tiếp key. API AI cũ luôn 404; không phục vụ `.env`, source, Git hay backups. `.env.example` chỉ còn HOST/PORT/APP_ORIGIN/APP_DATA_MODE cho máy chủ file local, không liên quan OpenRouter.

Mặc định local `APP_DATA_MODE=preview`: giữ đọc Firebase, mọi thay đổi chỉ lưu namespace local, không ghi cloud; banner nêu rõ. `APP_DATA_MODE=cloud` chỉ bật chủ động sau khi kiểm thử. Bản static public giữ luồng Firebase và quyền cũ, không migrate dữ liệu hoặc thay Security Rules. Key AI không thay thế quyền admin/database.

**GitHub Pages có thể chạy bản này trực tiếp**, không cần Render/backend/biến môi trường chứa key. Khi đã được duyệt triển khai, build static offline tại root:

```bash
python3 build_web.py --offline --output-dir .
```

Chỉ build trên branch không tự cập nhật Pages từ `main`; chưa merge/push/deploy bản này. Không dùng `python3 build_web.py` thiếu cờ vì lệnh cũ đọc Firestore. `npm run build` tạo `dist/` offline, không sửa HTML root; các assets dùng chung thư mục `assets/`. Đổi domain/trình duyệt thì nhập key lại.

Mã AI nằm ở `src/ai_service.js` (prompt/schema/HTTPS OpenRouter/output), `src/ai_context.js` (điểm/phong độ thuần), `src/ai_client.js` (popup/key/các tác vụ), `src/create_flow.js` (AI → thuật toán/checklist). Đã bỏ thư mục backend AI `server/`.

Test trình duyệt: `PLAYWRIGHT_MODULE=/path/to/playwright node tests/browser_web_app.cjs`, `tests/device_key_browser.cjs`, `tests/static_ai_browser.cjs`, `tests/theme_browser.cjs` (Chrome đã cài). Dùng provider giả và chặn Firebase; không dùng key thật hoặc phát sinh phí.

Theme web app nằm ở `src/theme.css`, nhúng cuối cùng khi build. Mặc định sáng (trắng ngà/xanh sage), tối dùng xám than; giữ lựa chọn đã lưu bằng nút sáng/tối. Lớp theme dùng chung cho dashboard, màn con, AI và popup; không đổi màu áo hai đội, logo/ảnh cầu thủ hay ngọn lửa phong độ. Kiểm tra hình ảnh/độ tương phản: `PLAYWRIGHT_MODULE=/path/to/playwright node tests/theme_browser.cjs`.
Layout dùng mật độ gọn: padding menu/thẻ chính khoảng 10–14px, nút menu khoảng 64px cao. Hàng thao tác lịch sử nằm trong luồng grid, chỉ chiếm chỗ khi có nút; không chừa sẵn 44–82px trống. Nút chức năng trên mobile vẫn giữ vùng bấm tối thiểu 44px.

Mục Thu chi đang tạm ẩn bằng `hidden` ở `financeNavBtn` và `screen-finance`; không xóa dữ liệu, mã xử lý hoặc đồng bộ sổ quỹ. Muốn hiện lại thì bỏ hai thuộc tính `hidden` này rồi build.
Hai file HTML ở root trên branch này đã đồng bộ offline; AI gọi OpenRouter trực tiếp cả ở bản static. Cập nhật branch không tự cập nhật GitHub Pages đang chạy từ `main`.

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
│   ├── optimizer.js      #   thuật toán chia đội (duyệt toàn bộ + Hungarian)
│   ├── ui_icons.js       #   ánh xạ icon ảnh AI cho menu/màn con/cúp/bóng
│   ├── ui_icons_solid.js #   icon nhỏ dạng hình khối nhiều màu, không dùng bộ nét viền
│   ├── ui_icons_dom.js   #   gắn icon cho nhãn UI, kể cả sau khi vẽ lại màn hình
│   └── ui_icons.css      #   kích thước, màu và khung icon
└── assets/
    └── banner.jpg        # ảnh banner đầu trang
```

- **`index.html`** = trang web có nút "Tạo 2 đội" — chọn người có mặt → chia đội ngay trong trình duyệt (không cần server/AI). Là **output**, sinh bởi `build_web.py`.
- Sửa giao diện/thuật toán → sửa trong **`src/`** rồi chạy lại `build_web.py`.
- Bộ ánh xạ icon được nhúng vào HTML lúc build, không tải thư viện ngoài. Ảnh icon menu nằm trong `assets/ui/`: PNG gốc từ AI, WebP 192px để tải nhẹ, prompt trong `generation.json`. Dùng tên đúng chức năng: `lineup`, `squad`, `ranking`, `match-history`, `player-form`, `finance`, `backup`. Ví dụ `GPIcons.render('ranking')` hoặc `data-ui-icon="ranking"`; tên chung như `users` (người chấm), `history` (nhật ký), `chart` (biểu đồ), `goal` (bàn thắng) không dùng chung ảnh menu. `data-ui-no-icons` bảo vệ nội dung người dùng khỏi thay thế biểu tượng.
- Kiểm tra ngữ cảnh icon và asset (chỉ đọc, không gọi cloud): `node tests/ui_icons.test.cjs`.
- Trận xếp gôn thủ công khi chưa có điểm riêng: đặt `result.evA.gkRated=false` (hoặc `evB`). Bảng hiển thị "Chưa chấm", không xem đó là điểm 0; sức mạnh được đối chiếu cùng số người ngoài sân và dự bị, không cộng cầu thủ dự bị dư vào lợi thế. Các trận không có cờ này giữ cách tính cũ. Kiểm tra: `node tests/match_comparison.test.cjs`.
- Khi đã chấm gôn riêng cho trận (`gkRated=true`), sơ đồ và bảng so kè cùng dùng `gkFit`; điểm này không thay đổi hồ sơ cầu thủ hoặc các trận cũ.
- Trận có `result.evA.ratingsByRole=true` (và `evB`) hiển thị điểm đúng vị trí thi đấu trên sơ đồ, thống nhất với bảng so kè. Không có cờ này vẫn hiển thị như cũ; chỉ số trong hồ sơ không thay đổi.
- Trận có `result.evA.pairedBenchComparison=true` (hoặc `evB`) đối chiếu cùng số dự bị mạnh nhất mỗi bên, kể cả khi đã chấm đủ hai gôn. Người dư vẫn hiện trên sơ đồ/bảng nhưng không được cộng thành lợi thế tổng lực. Các trận cũ không có cờ giữ nguyên cách tính.
- Màn con/popup có tên riêng: `match-score` (tỉ số), `goal-record` (ghi bàn/rà soát bàn), `player-rating` (chấm điểm/AI Form), `match-analysis` (so kè/nhận định), `finance-ledger` (sổ quỹ), `activity-log` (nhật ký sửa). Gắn ảnh bằng tên rõ nghĩa, không đổi hàng loạt icon chung; tiêu đề vẽ lại bằng JS phải dùng `GPIcons.render(...)` để không mất ảnh sau khi mở popup. `football`/`goal`/`scorer` dùng ảnh bóng 3D riêng; `trophy` dùng cúp vàng. Các icon nhỏ được vẽ thành hình khối SVG nhiều màu để rõ ở 14–24px, `income`/`expense` có chiều mũi tên khác nhau; logo, avatar và ngọn lửa sân bóng giữ nguyên. Build nhúng `ui_icons_solid.js` trước `ui_icons.js`.

## Chạy
Điểm cầu thủ **sống trong Firestore DB** (sửa ngay trên web ở mục "Cầu thủ" → tự lưu cloud). `build_web.py` đọc điểm mới nhất **từ DB** để sinh lại trang — không còn file Excel nào.
```bash
python3 build_web.py      # đọc điểm từ Firestore → sinh index.html (mở bằng trình duyệt)
```
Mở `index.html` → tick người có mặt → bấm **Tạo 2 đội**. Mọi tính toán chạy trong trình duyệt.

## Yêu cầu
Python 3 (chỉ dùng thư viện chuẩn) · trang web không cần cài gì.
