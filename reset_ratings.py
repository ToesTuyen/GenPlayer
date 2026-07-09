#!/usr/bin/env python3
"""
RESET chỉ số toàn bộ cầu thủ trong Firestore DB GenPlayer về mặc định "cầu thủ mới".

- Đọc snapshot backup, GIỮ NGUYÊN n/pos/pos2/desc/lp của mỗi cầu thủ.
- Đặt lại TẤT CẢ chỉ số = 0 (KT,CH,DD,PN,TC,TL,DN,TD,OD,TM) → trống hẳn để chấm lại.
- Thay toàn bộ ratings bằng đúng 1 lượt baseline "(khởi tạo)".
- PATCH chỉ field `players` (updateMask.fieldPaths=players) → các field khác giữ nguyên.
"""
import json
import urllib.request
import urllib.error

BACKUP = "/Users/tuyennd/Documents/VN_NAMI/Tools/GenPlayer/backups/genplayer-PRE-RESET-20260613-230519.json"
DOC_URL = "https://firestore.googleapis.com/v1/projects/ai-gen-aa66f/databases/(default)/documents/genplayer/data"

KEEP_FIELDS = ("n", "pos", "pos2", "desc", "lp")
FIELD_STATS = ("KT", "CH", "DD", "PN", "TC", "TL", "DN", "TD", "OD")  # = 0 (trống)


def iv(x):
    return {"integerValue": str(x)}


def build_baseline_rating():
    fields = {k: iv(0) for k in FIELD_STATS}
    fields["TM"] = iv(0)
    fields["ts"] = {"nullValue": None}
    return {"mapValue": {"fields": fields}}


def reset_player(player_mapvalue):
    src = player_mapvalue["mapValue"]["fields"]
    new_fields = {}
    # Giữ nguyên xi các field mô tả/vị trí
    for k in KEEP_FIELDS:
        if k in src:
            new_fields[k] = src[k]
    # Đặt lại TẤT CẢ chỉ số = 0 (trống hẳn)
    for k in FIELD_STATS:
        new_fields[k] = iv(0)
    new_fields["TM"] = iv(0)
    # Thay toàn bộ ratings bằng đúng 1 lượt baseline
    new_fields["ratings"] = {
        "mapValue": {"fields": {"(khởi tạo)": build_baseline_rating()}}
    }
    return {"mapValue": {"fields": new_fields}}


def main():
    with open(BACKUP, encoding="utf-8") as f:
        doc = json.load(f)

    players = doc["fields"]["players"]["arrayValue"]["values"]
    print(f"Đọc backup: {len(players)} cầu thủ")

    new_players = [reset_player(p) for p in players]
    names = [p["mapValue"]["fields"].get("n", {}).get("stringValue", "?") for p in new_players]

    body = {"fields": {"players": {"arrayValue": {"values": new_players}}}}
    url = DOC_URL + "?updateMask.fieldPaths=players"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, method="PATCH",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            status = resp.status
            resp_body = resp.read().decode("utf-8")
        print(f"PATCH OK — HTTP {status}")
    except urllib.error.HTTPError as e:
        print(f"PATCH LỖI — HTTP {e.code}")
        print(e.read().decode("utf-8"))
        raise

    print(f"Đã reset {len(new_players)} cầu thủ:")
    for i, nm in enumerate(names, 1):
        print(f"  {i:2}. {nm}")


if __name__ == "__main__":
    main()
