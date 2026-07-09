#!/usr/bin/env bash
# Bật OTA: báo TẤT CẢ người dùng đang ở bản cũ cập nhật lên v1.1 (có Góp ý).
# Chỉ ghi field `appUpdate` (không đụng players/history/feedback...).
# Sửa versionCode/versionName/url/notes ở đây cho các lần phát hành sau.
set -e
URL="https://firestore.googleapis.com/v1/projects/ai-gen-aa66f/databases/(default)/documents/genplayer/data?updateMask.fieldPaths=appUpdate"

read -r -d '' PAYLOAD <<'JSON' || true
{"fields":{"appUpdate":{"mapValue":{"fields":{
  "versionCode":{"integerValue":"2"},
  "versionName":{"stringValue":"1.1"},
  "url":{"stringValue":"https://toestuyen.github.io/GenPlayer/download/FCHaHa-v1.1.apk"},
  "notes":{"stringValue":"🆕 Thêm mục Góp ý / đánh giá: anh em gửi góp ý (kèm chấm sao) thẳng tới ban tổ chức. Cùng vài tinh chỉnh giao diện."},
  "mandatory":{"booleanValue":false}
}}}}}
JSON

echo "→ Đang bật OTA (versionCode 2 / v1.1)…"
curl -s -X PATCH "$URL" -H "Content-Type: application/json" --data "$PAYLOAD" | python3 -c '
import sys,json
d=json.load(sys.stdin)
au=d.get("fields",{}).get("appUpdate",{}).get("mapValue",{}).get("fields")
if not au: print("❌ LỖI:", json.dumps(d)[:400]); sys.exit(1)
print("✅ Đã bật OTA. appUpdate trên Firestore:")
for k,v in au.items(): print(f"   {k}: {list(v.values())[0]}")
'

# TẮT OTA sau khi mọi người đã cập nhật (tránh nhắc mãi): chạy
#   curl -s -X PATCH "$URL" -H "Content-Type: application/json" \
#     --data '{"fields":{"appUpdate":{"mapValue":{"fields":{"versionCode":{"integerValue":"0"}}}}}}'
