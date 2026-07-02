import sys
p = r"C:\Users\macum\AppData\Roaming\Code\User\History\-52d08b63\1DyP.tsx"
raw = open(p, "rb").read()
print("first bytes:", raw[:30])
# mojibake 복원 시도: UTF-8 원문을 CP949/Latin1로 잘못 디코딩한 케이스 역변환
for wrong in ["cp949", "latin1", "cp1252"]:
    try:
        txt = raw.decode("utf-8")
        cand = txt.encode(wrong).decode("utf-8")
        if any(k in cand for k in ["로그인","버튼","아이콘"]):
            print("OK via utf8->%s->utf8" % wrong)
            print(cand[:300])
            sys.exit()
    except Exception as e:
        print(wrong, "->", e)
print("no simple roundtrip worked")
