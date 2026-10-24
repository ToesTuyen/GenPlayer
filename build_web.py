# -*- coding: utf-8 -*-
"""Ghep src/web_template.html + src/optimizer.js + diem cau thu (doc tu Firestore DB) -> index.html.

Nguon diem cau thu = Firestore (collection 'genplayer' / doc 'data', field 'players').
Day la noi web app ghi khi sua diem, nen luon la du lieu moi nhat. KHONG doc tu file/xlsx.

Cau truc: src/ = nguon (template + optimizer); assets/ = anh; index.html = output o root (GitHub Pages).
"""
import argparse, json, os, sys, re, urllib.request

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

# Web-app builds are reproducible/offline by default through npm; the legacy
# command without flags deliberately retains the existing Firestore build.
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument("--offline",action="store_true",help="Reuse the existing baked player seed; no network")
parser.add_argument("--output-dir",default=ROOT,help="Output directory (e.g. dist)")
args=parser.parse_args()
# 1) doc diem cau thu tu DB, hoac dung seed da public khi build web app
try:
    if args.offline:
        with open(ROOT+"index.html",encoding="utf-8") as f: existing=f.read()
        match=re.search(r"const DEFAULT_PLAYERS = (.*?);\s*\n",existing)
        if not match: raise ValueError("Khong tim thay player seed trong index.html")
        players=json.loads(match.group(1))
    else:
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
icons=(open(SRC+"ui_icons_solid.js",encoding="utf-8").read()+"\n"+
       open(SRC+"ui_icons.js",encoding="utf-8").read())
icon_dom=open(SRC+"ui_icons_dom.js",encoding="utf-8").read()
icon_css=open(SRC+"ui_icons.css",encoding="utf-8").read()
html=(tpl.replace("/*__OPTIMIZER__*/",opt)
         .replace("/*__UI_ICONS__*/",icons+"\n"+icon_dom)
         .replace("/*__UI_ICON_CSS__*/",icon_css)
         .replace("/*__PLAYERS__*/",players_js)
         .replace("/*__FIREBASE__*/",fb)
         .replace("/*__HEROBG__*/",herobg))
html=(html.replace("/*__AI_CLIENT__*/",open(SRC+"ai_client.js",encoding="utf-8").read())
          .replace("/*__CREATE_FLOW__*/",open(SRC+"create_flow.js",encoding="utf-8").read())
          .replace("/*__AI_CONTEXT__*/",open(SRC+"ai_context.js",encoding="utf-8").read())
          .replace("/*__AI_CSS__*/",open(SRC+"ai.css",encoding="utf-8").read())
          .replace("/*__THEME_CSS__*/",open(SRC+"theme.css",encoding="utf-8").read()))

out=os.path.abspath(args.output_dir)
os.makedirs(out,exist_ok=True)
open(os.path.join(out,"index.html"),"w",encoding="utf-8").write(html)
# Lối vào riêng không nằm trong cache của index/PWA cũ; cùng nội dung, cùng dữ liệu thời gian thực.
open(os.path.join(out,"score-update.html"),"w",encoding="utf-8").write(html)
print("Đã tạo index.html + score-update.html ·",len(players),"cầu thủ (nguồn:",("seed offline" if args.offline else "Firestore DB"),") · Firebase:",
      ("BẬT" if fb!="null" else "tắt (cục bộ)"),"·",len(bgfiles),"nền banner ·",len(html),"ký tự")
assert not re.search(r"/\*__[A-Z_]+__\*/",html), "Còn placeholder!"
print("OK: không còn placeholder")
