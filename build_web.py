# -*- coding: utf-8 -*-
"""Ghep src/web_template.html + src/optimizer.js + diem cau thu (doc tu Firestore DB) -> index.html.

Nguon diem cau thu = Firestore (collection 'genplayer' / doc 'data', field 'players').
Day la noi web app ghi khi sua diem, nen luon la du lieu moi nhat. KHONG doc tu file/xlsx.

Cau truc: src/ = nguon (template + optimizer); assets/ = anh; index.html = output o root (GitHub Pages).
"""
import json, os, sys, re, urllib.request

ROOT=os.path.dirname(os.path.abspath(__file__))+"/"   # thu muc chua build_web.py (= root repo)
SRC=ROOT+"src/"
PROJECT="ai-gen-aa66f"
DOC_URL=("https://firestore.googleapis.com/v1/projects/%s/databases/(default)"
         "/documents/genplayer/data" % PROJECT)

# ---- Firestore REST value -> python ----
def fsval(v):
    if "integerValue" in v: return int(v["integerValue"])
    if "doubleValue"  in v: return v["doubleValue"]
    if "booleanValue" in v: return v["booleanValue"]
    if "stringValue"  in v: return v["stringValue"]
    if "nullValue"    in v: return None
    if "arrayValue"   in v: return [fsval(x) for x in v["arrayValue"].get("values",[])]
    if "mapValue"     in v: return {k:fsval(x) for k,x in v["mapValue"].get("fields",{}).items()}
    return None

def players_from_db():
    req=urllib.request.Request(DOC_URL,headers={"User-Agent":"genplayer-build"})
    with urllib.request.urlopen(req,timeout=15) as r:
        doc=json.load(r)
    pl=doc.get("fields",{}).get("players")
    return fsval(pl) if pl else []

# 1) doc diem 20 cau thu tu DB (Firestore)
try:
    players=players_from_db()
    if not players: raise ValueError("DB tra ve rong")
except Exception as e:
    sys.exit("❌ Khong doc duoc diem tu Firestore (%s). Kiem tra mang/DB roi chay lai." % e)
players_js=json.dumps(players,ensure_ascii=False)

# 2) doc src/optimizer.js, bo phan test node
opt=open(SRC+"optimizer.js",encoding="utf-8").read()
opt=opt.split("// ===== Node test =====")[0].rstrip()

# 3) firebase config (neu co file firebase_config.json) -> bat dong bo real-time
fb="null"
if os.path.exists(ROOT+"firebase_config.json"):
    fb=open(ROOT+"firebase_config.json",encoding="utf-8").read().strip()

# 3b) nen banner = tu quet assets/bg-*.jpg|png (so theo so thu tu); tha them file la tu dung
ASSETS=ROOT+"assets"
bgfiles=sorted([f for f in os.listdir(ASSETS) if re.match(r"bg-\d+\.(jpe?g|png)$",f,re.I)],
               key=lambda x:int(re.search(r"\d+",x).group())) if os.path.isdir(ASSETS) else []
herobg=json.dumps(["assets/"+f for f in bgfiles],ensure_ascii=False)

# 4) nhet vao src/web_template.html
tpl=open(SRC+"web_template.html",encoding="utf-8").read()
html=(tpl.replace("/*__OPTIMIZER__*/",opt)
         .replace("/*__PLAYERS__*/",players_js)
         .replace("/*__FIREBASE__*/",fb)
         .replace("/*__HEROBG__*/",herobg))

open(ROOT+"index.html","w",encoding="utf-8").write(html)
print("Đã tạo index.html ·",len(players),"cầu thủ (nguồn: Firestore DB) · Firebase:",
      ("BẬT" if fb!="null" else "tắt (cục bộ)"),"·",len(bgfiles),"nền banner ·",len(html),"ký tự")
assert not any(ph in html for ph in ("/*__OPTIMIZER__*/","/*__PLAYERS__*/","/*__FIREBASE__*/","/*__HEROBG__*/")), "Còn placeholder!"
print("OK: không còn placeholder")
