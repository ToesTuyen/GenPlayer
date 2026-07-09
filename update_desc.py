# -*- coding: utf-8 -*-
"""Cập nhật field `desc` của từng cầu thủ trong Firestore theo chỉ số mới nhất.
Giữ NGUYÊN mọi field khác (ratings, chỉ số, pos, pos2...). Backup trước khi ghi.
Chạy: python3 update_desc.py            -> chỉ xem (dry-run, in diff)
      python3 update_desc.py --write    -> ghi vào DB (PATCH updateMask=players)
"""
import json, urllib.request, time, sys, os

PROJECT="ai-gen-aa66f"
URL=("https://firestore.googleapis.com/v1/projects/%s/databases/(default)"
     "/documents/genplayer/data" % PROJECT)

# Mô tả mới theo chỉ số mới (2–3 dòng; cầu thủ chỉ số cao viết đậm hơn)
DESC={
"Cris Dao":"Hậu vệ biên nhãn quan tốt, đọc trận nhạy và phân phối bóng sắc bén. Kỹ thuật khéo, phòng ngự chắc, đủ sức dâng cánh chơi như một tiền vệ. Tốc độ và thể lực ở mức trung bình nên mạnh nhất khi cầm nhịp thay vì đua sức.",
"Doan Ha":"Tiền đạo nhãn quan tốt, dứt điểm khá và biết chọn vị trí. Kỹ thuật cùng khả năng chuyền bóng đủ để lùi làm tường, phối hợp. Thể lực và độ năng nổ ở mức vừa phải.",
"Duy Hùng":"Hậu vệ biên cần mẫn với các mặt khá đồng đều quanh mức trung bình. Chịu khó lên công về thủ, tốc độ và thể lực đủ dùng. Cần trau dồi thêm chuyền bóng và phòng ngự để chắc chân hơn.",
"Hoàng Duy":"Hậu vệ biên cực giàu thể lực — tốc độ, sức bền và độ máu lửa đều thuộc hàng đầu đội, lên công về thủ không biết mệt. Phòng ngự chắc chắn, tì đè và càn quét tốt. Kỹ thuật, nhãn quan ổn; hợp lối chơi tốc độ, áp sát liên tục.",
"Hoàng Thiên":"Tiền đạo toàn diện: dứt điểm sắc bén, kỹ thuật khéo và đọc trận tốt. Đặc biệt phản xạ bắt gôn xuất sắc — sẵn sàng trấn giữ khung thành cực chắc khi cần. Một quân bài đa năng đáng giá ở cả hai đầu sân.",
"Hưng":"Trung vệ thòng điềm tĩnh, giữ và phát động bóng tốt, kỹ thuật cùng nhãn quan đều ổn. Càn quét, bọc lót chắc chắn, đọc tình huống hợp lý. Tốc độ vừa phải nên mạnh ở khả năng chỉ huy và cầm nhịp tuyến dưới.",
"Huy Hoàng":"Nhạc trưởng tuyến giữa hàng đầu: kỹ thuật thượng thừa, chuyền và dứt điểm đều sắc bén, lại đủ tốc độ để xộc thẳng vào vòng cấm. Thể lực, năng nổ dồi dào, dạt cánh còn lợi hại hơn cả khi đá giữa. Mẫu cầu thủ gánh được cả khâu sáng tạo lẫn ghi bàn.",
"Mạnh Khắc":"Hậu vệ biên thiên về tấn công: kỹ thuật, chuyền, dứt điểm và tốc độ đều tốt. Lên biên hỗ trợ mượt mà, xử lý bóng gọn gàng. Phòng ngự và thể lực ở mức trung bình nên hợp vai hậu vệ thích leo biên hoặc đẩy lên đá tiền vệ cánh.",
"Mạnh Tiến":"Thủ môn chắc chắn, chọn vị trí và phòng ngự hợp lý. Tốc độ, thể lực ổn nên có thể trám hậu vệ biên khi cần. Khả năng chơi chân còn hạn chế, mạnh nhất ở vai trấn giữ khung gỗ.",
"Nam Khắc":"Trung vệ đọc trận nhạy bén và tốc độ hiếm có ở tuyến dưới. Chuyền phát động và phòng ngự đều tốt, càn quét bọc lót chắc. Cơ động, sẵn sàng dạt biên đá hậu vệ — mẫu trung vệ hiện đại biết dâng cao.",
"Nguyễn Danh Tuyên":"Hậu vệ biên kỹ thuật và nhanh nhẹn, đọc trận tốt, chuyền bóng chuẩn xác. Lên hỗ trợ tấn công biên mượt mà. Thể lực và độ năng nổ ở mức trung bình, hợp lối đá phối hợp hơn là tì đè.",
"Nguyễn Khắc Trọng":"Thủ môn số một: phản xạ tốt, bắt bóng chắc tay, lại chơi chân khéo. Phòng ngự chắc nên có thể lùi đá trung vệ. Điểm tựa vững cho hàng thủ; hạn chế ở tốc độ, thể lực nên chơi thiên về chọn vị trí.",
"Nguyen Quy Bong":"Nhạc trưởng đúng nghĩa: kỹ thuật khéo léo bậc nhất, chuyền và nhãn quan xuất sắc, điều tiết toàn bộ thế trận. Dứt điểm sắc, thể lực và năng nổ tốt nên lên công về thủ đều đặn. Mẫu tiền vệ trung tâm hoàn thiện, vừa sáng tạo vừa ghi bàn.",
"Nguyễn Văn Quyền":"Hậu vệ biên cần mẫn, các chỉ số đồng đều quanh mức khá. Đọc tình huống và bọc lót hợp lý, sẵn sàng dâng cao đá tiền đạo khi cần. Lối chơi chắc chắn, không có điểm yếu rõ rệt.",
"Quang Minh":"Tiền vệ cánh giàu năng lượng: tốc độ, thể lực và độ máu lửa đều tốt, bám biên lên xuống không ngơi nghỉ. Dứt điểm và phòng ngự khá, lại có phản xạ bắt gôn nên trám được cả thủ môn lẫn hậu vệ. Quân đa năng, càng nhiều vai trò càng giá trị.",
"Quý Tàu":"Hậu vệ biên đang hoàn thiện, kỹ thuật nhỉnh hơn cả, các mặt còn lại quanh mức cơ bản. Chịu khó lên công về thủ nhưng cần cải thiện dứt điểm và tranh chấp. Hợp vai trò đơn giản, chắc chân ở phần sân nhà.",
"Quyết Nguyễn":"Hậu vệ biên toàn diện: chuyền, dứt điểm, phòng ngự và tốc độ đều tốt. Càn quét bọc lót chắc, lại đủ sắc bén để dâng cao đá tiền đạo. Thể lực và năng nổ ở mức trung bình, mạnh nhất khi chơi chắc và chọn thời điểm leo biên.",
"Trịnh Mạnh":"Trung vệ chững chạc, phòng ngự chắc và đọc trận tốt. Chuyền phát động khá, kỹ thuật ổn nên triển khai bóng mượt. Có thể dạt ra đá hậu vệ biên; tốc độ vừa phải, mạnh ở khả năng chỉ huy tuyến dưới.",
"Trịnh Tuấn Anh":"Tiền vệ cánh năng động, tốc độ và thể lực bền bỉ, máu lửa bám biên cả công lẫn thủ. Dứt điểm khá, sẵn sàng lùi về đá hậu vệ. Kỹ thuật và chuyền bóng cần trau dồi, nhưng sức chạy là vũ khí lớn.",
"Văn Thanh":"Tiền vệ giữa cân bằng hiếm thấy: kỹ thuật, chuyền, dứt điểm và phòng ngự đều tốt. Vừa cầm nhịp sáng tạo vừa lùi về càn quét, đọc trận hợp lý. Đa năng, có thể đẩy ra cánh; tốc độ và thể lực ở mức ổn.",
"Siêu Phủi Bụi":"Cầu thủ mới, chưa có chỉ số đánh giá. Cần chấm điểm để xác định sở trường và vị trí phù hợp.",
}

def fetch():
    req=urllib.request.Request(URL,headers={"User-Agent":"gp-desc"})
    return json.load(urllib.request.urlopen(req,timeout=20))

def sv(x):
    if "stringValue" in x: return x["stringValue"]
    return None

def main():
    write="--write" in sys.argv
    doc=fetch()
    players=doc["fields"]["players"]["arrayValue"]["values"]
    names_db={sv(p["mapValue"]["fields"].get("n",{})) for p in players}
    missing=[n for n in DESC if n not in names_db]
    extra=[n for n in names_db if n not in DESC]
    if missing: sys.exit("❌ Tên không khớp DB: %s" % missing)
    if extra:   print("⚠️  Cầu thủ trong DB chưa có mô tả mới (giữ nguyên):", extra)

    # backup trước khi đổi
    os.makedirs("backups",exist_ok=True)
    ts=time.strftime("%Y%m%d-%H%M%S")
    bpath="backups/PRE-DESC-%s.json"%ts
    json.dump(doc,open(bpath,"w"),ensure_ascii=False,indent=1)
    print("Backup:",bpath)

    changed=0
    for p in players:
        f=p["mapValue"]["fields"]; nm=sv(f.get("n",{}))
        if nm in DESC:
            old=sv(f.get("desc",{})) or ""
            new=DESC[nm]
            if old!=new:
                f["desc"]={"stringValue":new}; changed+=1
    print("Số mô tả thay đổi:",changed,"/",len(players))
    if not write:
        print("\n(DRY-RUN) chưa ghi. Thêm --write để PATCH lên Firestore."); return

    body=json.dumps({"fields":{"players":doc["fields"]["players"]}}).encode("utf-8")
    purl=URL+"?updateMask.fieldPaths=players"
    req=urllib.request.Request(purl,data=body,method="PATCH",
                               headers={"Content-Type":"application/json","User-Agent":"gp-desc"})
    with urllib.request.urlopen(req,timeout=30) as r:
        res=json.load(r)
    print("✅ Đã PATCH. updateTime mới:",res.get("updateTime"))

if __name__=="__main__":
    main()
