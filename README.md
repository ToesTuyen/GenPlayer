# GenPlayer — Chia 2 đội bóng sân 7 cân bằng

Công cụ chia **20 cầu thủ** thành **2 đội cân bằng nhất** cho bóng đá sân 7, kèm sơ đồ thi đấu trực quan (HTML) và phân tích ưu/nhược điểm.

## Web app + OpenRouter (branch `feat/web-app-openrouter`)

Bản mới giữ nguyên thuật toán, Firebase và lịch sử. Thêm Node backend và tích hợp **AI ngay trong màn Tạo đội**, không có mục AI riêng ở menu. Không chuyển framework hoặc migrate dữ liệu. Bản GitHub Pages trên `main` chưa thay đổi.

### Chạy trên máy

Cần Node.js >=18.20 và Python 3; không có package phụ thuộc phải cài.

```bash
cp .env.example .env
# Mở .env, điền OPENROUTER_API_KEY và AI_ACCESS_PASSWORD (ít nhất 16 ký tự).
npm start
```

Mở **http://localhost:3000** → **Tạo đội** → chọn người → bấm **Tạo đội** ở đầu danh sách. Checkbox **Chọn tất cả** hỗ trợ chọn, bỏ chọn và trạng thái chọn một phần. Nút **Tuỳ chọn AI** mở các tác vụ phân tích và **Kết nối OpenRouter** để nhập mật khẩu `AI_ACCESS_PASSWORD`. Đây là quyền gọi AI trả phí, tách biệt tài khoản quản lý trận hiện tại. Phiên hết hạn sau 30 phút. Không nhập OpenRouter key vào ô mật khẩu.

Tuỳ chọn AI mở/đóng ngay dưới thanh nút, trong cùng thẻ danh sách; không có khối/tiêu đề AI riêng hoặc mục tạo đội thứ hai. Kết nối OpenRouter là cấu hình chính; nhận định, phong độ và mô tả cầu thủ được giữ trong mục thu gọn **Công cụ phân tích**. Kết quả phân tích xuất hiện cùng khu vực kết quả, không nằm trong khung cấu hình.

Ngay trên danh sách có phần **Tiêu chí tạo đội** (12 mục, mở xem chi tiết) và ô **Note — yêu cầu riêng cho lần tạo này**, luôn hiện dù chưa mở Tuỳ chọn AI. Note hiện tại là nguồn duy nhất cho yêu cầu riêng: để trống thì không có chỉ định riêng, không lấy lệnh của trận cũ từ lịch sử. Note chỉ nằm trong phiên trang, không tự lưu vào trận/nhận định; ghi chú phân tích là ô riêng. Tiến trình có bước Note và kết quả giữ snapshot Note đã dùng: AI nhận Note nhưng vẫn cần đối chiếu thủ công; thuật toán dự phòng chưa hiểu Note nên cảnh báo **Chưa áp dụng Note**. Sửa Note sau khi tạo sẽ báo bản nháp chưa cập nhật, cần Tạo đội lại.

- `OPENROUTER_API_KEY`: chỉ ở server `.env`, không vào HTML, localStorage, Firebase hay Git. `.env` đã được ignore. Nên đặt hạn mức tín dụng riêng cho key theo [hướng dẫn OpenRouter](https://openrouter.ai/docs/api_reference/authentication).
- `OPENROUTER_MODEL`: model ID hỗ trợ [structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs), mặc định `openai/gpt-4.1-mini`. Có thể đổi model rồi restart; app không tự chuyển model hay tự retry gây phí.
- `APP_DATA_MODE=preview` **mặc định**: đọc dữ liệu Firestore hiện có; các luồng lưu cũ chỉ lưu local, không gửi lệnh ghi cloud. Banner luôn hiển thị chế độ. Bản nháp local có thể bị snapshot cloud mới thay thế; không coi đây là kho lưu trữ lâu dài.
- `APP_DATA_MODE=cloud`: chủ động bật lại các luồng đồng bộ cũ sau khi kiểm thử. Admin có thể lưu nhận định AI vào đúng trận qua transaction; từ chối nếu đội hình/tỉ số/bàn thắng đã đổi trong lúc AI viết. Chỉ cập nhật nhận định, không tạo trận mới. Điểm cầu thủ không tự thay đổi.
- `APP_ORIGIN`: origin chính xác (không có `/` cuối), cần khớp địa chỉ mở app. Mặc định `http://localhost:3000`; nếu đổi port/domain phải đổi theo.
- `HOST=127.0.0.1` chỉ mở trên máy. Khi host server/container dùng `0.0.0.0` và HTTPS reverse proxy. Không công khai HTTP chứa mật khẩu.
- `AI_MAX_REQUESTS_PER_HOUR=20`: giới hạn chung cả server, cả yêu cầu provider bị lỗi cũng tính lượt; tối đa 2 yêu cầu đồng thời. Hạn mức/phiên trong RAM, reset khi restart; khi chạy nhiều instance cần shared rate-limit/session store.

### Các case AI đã nối vào UI

- **Chia đội sân 7 (14–24 người)**: chỉ một nút **Tạo đội**. Ưu tiên AI khi key/backend/phiên hợp lệ; thiếu cấu hình, hết phiên/lượt, key lỗi, timeout hoặc kết quả AI không hợp lệ thì tự dùng thuật toán cục bộ, không gọi lại AI. Nếu người dùng huỷ xác nhận gửi dữ liệu thì dừng, không tự chạy thay thế. AI đọc chỉ số/vị trí và 3 trận gần nhất, yêu cầu cân riêng công–thủ, hạn chế lặp đồng đội/vị trí, ưu tiên thành viên và khách dự bị. Kết quả tự thành bản nháp trên sân + bảng so kè; chỉ lưu trận bằng nút **Lưu làm đội tuần này** ở đầu danh sách.
- **Tiến trình tạo đội**: checklist phản ánh bước đọc dữ liệu/kiểm tra thực tế, không mô phỏng suy nghĩ LLM. Chỉ tích xanh sau khi hoàn tất; chênh công/thủ trên 1.5 điểm tổng ba vị trí, trái vị trí, người dự bị mạnh hơn hoặc lặp đội/vị trí sẽ được cảnh báo riêng. Thuật toán chạy trong Web Worker (giới hạn 90 giây) để giao diện không bị treo, giữ các phương án để bấm Tạo đội lần nữa đổi cách chia. Thuật toán chưa hiểu ghi chú tự do hoặc tối ưu lịch sử đồng đội; có thông báo rõ và kiểm tra xoay tua sau khi chia. Mức cân/yêu cầu riêng vẫn cần người duyệt. Không tự sửa chỉ số hoặc ghi Firebase khi tạo nháp.

Mỗi bước tiến trình được giữ hiển thị ít nhất **1 giây** để dễ đọc (thời gian xử lý thật đã tính vào khoảng này, không chờ thêm nếu API/thuật toán vốn chậm). Lỗi/huỷ hiển thị ngay. **Bước đang chạy luôn ở đầu**, được tô nổi; bên dưới là các bước đã chạy theo thứ tự mới nhất trước, rồi đến các bước chưa chạy. Chuyển bước thì bước trước lùi xuống, không cần cuộn đuổi theo. Xong vẫn giữ thứ tự đảo, cuộn về đầu và không tự đóng. Nút **Xem tiêu chí** ở thanh thao tác mở lại báo cáo lần tạo gần nhất trong phiên trang, không gọi lại AI hoặc sửa đội hình.
- **Nhận định trận**: chọn đúng trận; viết ít nhất 6 phần về các tuyến, đối đầu, chuỗi kết quả, bàn thắng và dự bị. Trận có tỉ số sẽ được phân tích như trận đã diễn ra. Các chỉ số dùng snapshot hồ sơ trong trận, không thay bằng điểm master hiện tại.
- **Phong độ / đề xuất điểm**: cửa sổ 5 trận **của đội**, tính cả vắng mặt; tăng, giữ, giảm hoặc chưa đủ dữ liệu. Dưới 3 lần có mặt không nhận đề xuất đổi chỉ số. Không tự áp dụng điểm.
- **Mô tả Cầu thủ nổi bật**: văn mới dựa trên chỉ số/phong độ, xem trước và sao chép; không tự đè mô tả đang dùng.

Trước mỗi lượt có xác nhận gửi dữ liệu bóng đá tới OpenRouter/model. Backend chỉ whitelist tên/chỉ số/vị trí, đội hình, kết quả và bàn thắng; không gửi tài khoản, sổ quỹ hay lịch sử từng người chấm. Dữ liệu bàn chưa khóa được đánh dấu; danh sách dự bị không có phút ra sân nên AI không được khẳng định đã thi đấu đầy đủ. Nội dung AI được escape khi hiển thị/lưu, không chạy HTML do model trả về.

### Build, test và triển khai

```bash
npm run build  # offline, dùng seed cầu thủ đã public trong index.html → dist/
npm test       # API, xác thực, dữ liệu, output, rate-limit + regression giao diện cũ
node server/index.cjs  # phục vụ dist/ đã build
```

`npm start` tự build lại trước khi chạy. Build không gọi Firestore và không sửa `index.html`/`score-update.html` đã deploy ở root. Dữ liệu mới nhất vẫn được tải qua Firebase khi mở app. Chỉ `python3 build_web.py` không cờ mới giữ hành vi đọc Firestore/build root cũ; không dùng lệnh đó để deploy branch này lên Pages.

Server chỉ phục vụ HTML đã build, manifest, service worker và `assets/`; không phục vụ `.env`, `.git`, source hay backups. `/api/ai/*` không cache; cookie HttpOnly/SameSite, kiểm tra Origin + CSRF, giới hạn request/timeout, lỗi provider không trả nguyên văn chứa thông tin nhạy cảm.

**GitHub Pages không chạy Node backend.** Để đưa bản này lên mạng cần một host chạy Node (VPS/container/app service), cấu hình biến môi trường và HTTPS; chạy `npm run build`, sau đó `node server/index.cjs`. Chưa thay domain/hosting và chưa deploy branch này. Xác thực/chính sách ghi Firestore cũ được giữ nguyên, **không phải** bản nâng cấp Firebase Security Rules; không coi mật khẩu AI là thay thế phân quyền DB. Không bật cloud công khai nếu chưa rà soát quyền Firebase.

Cấu trúc thêm: `server/index.cjs` (HTTP/session/static), `server/ai.cjs` (task/prompt/schema/OpenRouter), `src/ai_context.js` (context/điểm/phong độ thuần), `src/ai_client.js` + `src/ai.css` (UI). Test trình duyệt tùy chọn: `PLAYWRIGHT_MODULE=/path/to/playwright node tests/browser_web_app.cjs` (Chrome đã cài); dùng provider giả, không tốn phí, chặn Firebase.

Theme web app nằm ở `src/theme.css`, nhúng cuối cùng khi build. Mặc định sáng (trắng ngà/xanh sage), tối dùng xám than; giữ lựa chọn đã lưu bằng nút sáng/tối. Lớp theme dùng chung cho dashboard, màn con, AI và popup; không đổi màu áo hai đội, logo/ảnh cầu thủ hay ngọn lửa phong độ. Kiểm tra hình ảnh/độ tương phản: `PLAYWRIGHT_MODULE=/path/to/playwright node tests/theme_browser.cjs`.
Layout dùng mật độ gọn: padding menu/thẻ chính khoảng 10–14px, nút menu khoảng 64px cao. Hàng thao tác lịch sử nằm trong luồng grid, chỉ chiếm chỗ khi có nút; không chừa sẵn 44–82px trống. Nút chức năng trên mobile vẫn giữ vùng bấm tối thiểu 44px.

Mục Thu chi đang tạm ẩn bằng `hidden` ở `financeNavBtn` và `screen-finance`; không xóa dữ liệu, mã xử lý hoặc đồng bộ sổ quỹ. Muốn hiện lại thì bỏ hai thuộc tính `hidden` này rồi build.
Hai file HTML ở root trên branch này cũng đã được đồng bộ offline để mở local không còn thấy menu Thu chi cũ. Đây chỉ là bản static xem giao diện; muốn sử dụng AI phải mở backend ở `APP_ORIGIN`. Cập nhật file trên branch không tự cập nhật bản GitHub Pages đang chạy từ `main`.

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
