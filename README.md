# GenPlayer — Chia 2 đội bóng sân 7 cân bằng

Công cụ chia **20 cầu thủ** thành **2 đội cân bằng nhất** cho bóng đá sân 7, kèm sơ đồ thi đấu trực quan (HTML) và phân tích ưu/nhược điểm.

## Web app + OpenRouter trực tiếp

AI chạy **ngay trong trình duyệt → OpenRouter qua HTTPS**, không có backend AI/proxy hay API `/api/ai/*`. Mỗi người nhập key riêng trong popup khi vào Tạo đội; không nhúng key vào mã nguồn public. Bản static public giữ Firebase, lịch sử, khóa localStorage và quyền quản lý trận cũ; không migrate hoặc ghi đè dữ liệu khi triển khai.

### Nhập key và tạo đội

Vào **Tạo đội**: chưa có key thì popup **Kết nối OpenRouter** tự hiện. **Lưu key** đóng popup; **Bỏ qua, dùng thuật toán**, Esc hoặc × cũng đóng popup và xoá nội dung chưa lưu. Bỏ qua không gọi AI và không tự tạo đội: chọn người rồi bấm nút **Tạo đội** duy nhất để dùng thuật toán. Không hỏi lại khi bấm Tạo đội trong cùng màn; lần sau vào màn mà vẫn chưa có key thì nhắc lại. Có key đã lưu hoặc key tạm thì không tự hiện. Nút nhỏ **Key OpenRouter** mở lại để nhập/đổi/xoá key; không có nút hay lớp **Tuỳ chọn AI** hoặc form key dài trong danh sách.

Mặc định lưu key bằng localStorage trên đúng trình duyệt/origin, không đồng bộ sang máy khác. Bỏ chọn **Lưu trên trình duyệt này** nếu chỉ dùng tới khi tải lại/đóng trang. **Xoá key trên máy này** không thu hồi key tại OpenRouter hoặc huỷ lượt đã gửi. Ô nhập che key, xoá sau khi lưu/đóng và không tự điền lại; lỗi lưu hiển thị ngay trong popup. Lưu key và xem thông tin kết nối chỉ xử lý local, không gửi key hoặc kiểm tra provider. Chỉ lúc chạy AI mới có xác nhận gửi dữ liệu/tính phí theo key đó.

Key chỉ nằm trong storage riêng và header `Authorization` gửi thẳng tới `https://openrouter.ai/api/v1/chat/completions`, không đi qua máy chủ của app, không vào prompt, Git, HTML build, Firebase hay backup. Cách gọi dùng [Bearer token theo tài liệu OpenRouter](https://openrouter.ai/docs/api_reference/authentication).

**Cho phép nhập/lưu key cả trên link Wi-Fi HTTP.** Request API vẫn trực tiếp qua HTTPS, không gửi key tới máy chủ HTTP trên mạng nội bộ. Tuy nhiên trang HTTP có thể bị thay mã trên đường truyền; nên dùng bản online HTTPS. LocalStorage không phải kho bí mật tuyệt đối: script cùng origin/XSS, tiện ích có quyền hoặc người mở profile trình duyệt có thể đọc key. Các repo cùng origin không cách ly storage. Tránh máy dùng chung, đặt hạn mức cho từng key và thu hồi key từng lộ trong chat/log. Không dán key vào Note/nhận định.

### Luồng AI và tiêu chí

- **Chia đội 7 vs 7 (14–24 người)**: một nút **Tạo đội**. Có key thì trình duyệt chuẩn bị dữ liệu, gọi model và kiểm tra kết quả; thiếu key, lỗi mạng/CORS, key lỗi, timeout hoặc output không hợp lệ thì chuyển sang thuật toán Web Worker, không retry AI. Huỷ xác nhận gửi dữ liệu thì dừng, giữ bản nháp cũ.
- **Sau khi có đội hình → Đánh giá**: nút chỉ hiện khi có bản nháp (AI hoặc thuật toán), nằm cùng thanh thao tác phía trên. Không còn mục **Công cụ phân tích** chung trong màn Tạo đội. Bấm Đánh giá để AI nhận định đúng hai đội đang hiển thị; không lấy trận đang chọn trong lịch sử, danh sách có mặt đang sửa hoặc Note chia đội. Chưa có key thì mở popup nhập key, bỏ qua giữ nguyên đội hình. Tạo đội không tự hiển thị phần nhận định AI dài.
- **12 tiêu chí và Note** luôn hiện trên danh sách. Cân riêng công/thủ, ưu tiên người mạnh/thành viên, vị trí phù hợp, chia khách/dự bị, xoay tua đội hình và xét phong độ. Note hiện tại là nguồn duy nhất cho yêu cầu riêng, không lấy lệnh trận cũ; không đưa Note vào nhận định public. Thuật toán dự phòng đã kiểm tra xoay tua, chưa áp dụng Note hoặc tối ưu phong độ. Sửa Note sau khi tạo báo bản nháp chưa cập nhật.
- **Ràng buộc bắt buộc cho cả AI và thuật toán**: chọn nhóm 14 có tổng điểm hồ sơ theo vị trí chính cao nhất có thể gán đúng vị trí chính/phụ trước, rồi mới chia cân hai bên. Xét cả chuỗi đổi vai trò (thòng mạnh vào sân, thòng hiện tại ra hậu, hậu yếu dự bị), không chỉ thay trực tiếp một người. Điểm thưởng đúng vị trí chính và việc cân đội không được loại người mạnh khỏi nhóm này. Khi đủ hai thủ môn chính, dùng thủ môn chính; thành viên ưu tiên hơn khách. Vẫn chặn thành viên dự bị hơn người đá chính ngoài sân từ 0.5 điểm tại vai trò được phép. Công/thủ xét riêng, mỗi tuyến 3 vị trí chênh tổng điểm tối đa 1.5; không dùng gôn bù tuyến yếu. Dùng chung bộ kiểm tra trong `src/ai_context.js`, lọc trước khi giữ top 12. Không tìm được cách chia nhóm mạnh nhất mà đạt đủ các ngưỡng thì dừng, không âm thầm chọn nhóm yếu hơn, không gọi AI hay sửa bản nháp/trận cũ. AI đổi chỗ vi phạm thì giữ nền hợp lệ, hiện lý do; chuỗi đổi chỗ được kiểm tra sau khi hoàn tất để cho phép các đổi chỗ bù nhau.
- **Đúng vị trí cũng là bắt buộc**: ngoài sân chỉ dùng vị trí chính/phụ đã đăng ký. Đủ từ hai thành viên có vị trí chính TVtt thì mỗi bên có một người đá giữa; tổng nhóm TVtt cả chính lẫn dự bị chênh tối đa một người. Không kéo tiền đạo vào giữa chỉ vì điểm cân. Note hiện tại có thể cho phép thêm một vai trò qua câu chỉ định đơn giản, khẳng định và tên không nhập nhằng (ví dụ `Tuyên bắt gôn`, `Quyết đá thòng`); không nhận ngoại lệ do model tự khai, câu phủ định hoặc chỉ định mâu thuẫn. Các yêu cầu Note phức tạp vẫn cần đối chiếu, không giả vờ đã xác minh. Khi AI lỗi, thuật toán giải lại không dùng ngoại lệ Note. Thiếu thủ môn đăng ký vẫn cho phép gôn dự phòng có TM > 0 và cảnh báo xác nhận; không sửa hồ sơ hay trận cũ.
- **Khóa bổ sung** cho cả AI và thuật toán: dự bị sắp theo điểm vị trí chính, kiểm tra các nhóm mạnh nhất 1, 2… đến cùng số người hai bên; **từng nhóm** chênh trung bình tối đa 0.5. Không lấy người yếu kéo trung bình chung xuống để che nhóm mạnh dồn một bên. Sức mạnh chính và tổng lực cộng cùng số dự bị đều chênh tối đa 2; ngôi sao (điểm vị trí chính từ 8) chênh tối đa 1 ở chính, dự bị và tổng đội; tốc độ/thể lực trung bình chênh tối đa 0.5 ở 6 người ngoài sân và ngoài sân cộng cùng số dự bị. Không cộng người dư hoặc lấy gôn bù thể chất. Các ngưỡng nằm chung tại `GPAIContext.LINEUP_LIMITS`; tiến trình và bảng so kè hiển thị từng nhóm dự bị. Năng nổ/phong độ chưa có ngưỡng chặn riêng.
- **Xoay tua bắt buộc**: lấy trận gần nhất đã qua có đội hình hợp lệ, không bắt buộc có tỉ số; mỗi bên mới giữ tối đa 4 người từng đá chính chung một đội cũ, kiểm tra cả hai màu nên đổi A/B không qua được. Mức 3 là bất khả thi nếu cả 14 người cũ đều quay lại. Không bắt người chỉ có một vai trò phải đổi sang vị trí sai; số người giữ vai trò chỉ là thông tin. Chưa có lịch sử hoặc không có ai từng đá chính trận trước thì báo chưa đối chiếu được, không đánh dấu đã kiểm tra xoay tua. Lịch sử được gửi cả vào worker thuật toán và bộ kiểm tra AI; Note không được miễn các ngưỡng này.
- **Tiến trình 13 bước** là kiểm tra thực tế, không giả lập suy nghĩ LLM; mỗi bước tối thiểu 1 giây, active ở trên cùng, đã chạy mới nhất trước rồi tới pending. Xong không tự đóng; **Xem tiêu chí** mở lại không gọi AI. Có riêng bước cân dự bị, tổng lực/thể chất và xoay tua. Thiếu dữ liệu, Note chưa xác minh và đề xuất AI không áp dụng vẫn cảnh báo; ràng buộc bắt buộc vi phạm sẽ không xuất bản nháp mới. Không tìm được phương án thì nêu điều kiện còn vướng, không nới ngưỡng hoặc gọi AI trả phí.
- **Nhận định trận**: ít nhất 6 phần về các tuyến, đối đầu, chuỗi kết quả, bàn thắng, dự bị và kết luận; trận có tỉ số phân tích kết quả đã biết. Bản nháp chưa có lịch không được bịa ngày giờ; vẫn đọc đầy đủ lịch sử gần đây. Đánh giá không tự thay người/vị trí, sửa chỉ số hoặc ghi cloud. Phản hồi bị loại nếu bản nháp đổi trong lúc chờ; tạo lại đội sẽ xoá đánh giá cũ. Khi người dùng chủ động Lưu làm đội tuần này, nhận định hợp lệ đi cùng đúng bản nháp. Luồng nhận định trận đã lưu vẫn dùng snapshot và transaction đúng trận, không ghi nhầm từ bản nháp.
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

GitHub Pages phục vụ root của `main`; chỉ build trên branch phát triển không tự cập nhật website. Để thay bản public, kiểm thử, build offline hai HTML root rồi đưa commit đã duyệt lên `main`. Không dùng `python3 build_web.py` thiếu cờ vì lệnh cũ đọc Firestore. `npm run build` tạo `dist/` offline, không sửa HTML root; các assets dùng chung thư mục `assets/`. Đổi domain/trình duyệt thì nhập key lại. Bản phát hành có meta `genplayer-release`; service worker v5 chỉ dọn cache `genplayer-*`, không xóa localStorage hoặc cache ứng dụng khác.

Mã AI nằm ở `src/ai_service.js` (prompt/schema/HTTPS OpenRouter/output), `src/ai_context.js` (điểm/phong độ thuần), `src/ai_client.js` (popup/key/các tác vụ), `src/create_flow.js` (AI → thuật toán/checklist). Đã bỏ thư mục backend AI `server/`.

Test trình duyệt: `PLAYWRIGHT_MODULE=/path/to/playwright node tests/browser_web_app.cjs`, `tests/device_key_browser.cjs`, `tests/static_ai_browser.cjs`, `tests/draft_review_browser.cjs`, `tests/theme_browser.cjs` (Chrome đã cài). Dùng provider giả và chặn Firebase; không dùng key thật hoặc phát sinh phí.

Theme web app nằm ở `src/theme.css`, nhúng cuối cùng khi build. Mặc định sáng (trắng ngà/xanh sage), tối dùng xám than; giữ lựa chọn đã lưu bằng nút sáng/tối. Lớp theme dùng chung cho dashboard, màn con, AI và popup; không đổi màu áo hai đội, logo/ảnh cầu thủ hay ngọn lửa phong độ. Kiểm tra hình ảnh/độ tương phản: `PLAYWRIGHT_MODULE=/path/to/playwright node tests/theme_browser.cjs`.
Layout dùng mật độ gọn: padding menu/thẻ chính khoảng 10–14px, nút menu khoảng 64px cao. Hàng thao tác lịch sử nằm trong luồng grid, chỉ chiếm chỗ khi có nút; không chừa sẵn 44–82px trống. Nút chức năng trên mobile vẫn giữ vùng bấm tối thiểu 44px.

Mục Thu chi đang tạm ẩn bằng `hidden` ở `financeNavBtn` và `screen-finance`; không xóa dữ liệu, mã xử lý hoặc đồng bộ sổ quỹ. Muốn hiện lại thì bỏ hai thuộc tính `hidden` này rồi build.
Hai file HTML ở root được đồng bộ offline; AI gọi OpenRouter trực tiếp cả ở bản static. GitHub Pages cập nhật sau khi push lên `main` và lượt build/deploy hoàn tất.

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
