import json, os, urllib.parse, glob

HIST = os.path.expandvars(r"%APPDATA%\Code\User\History")
PROJ = r"C:\Users\macum\Desktop\korea-stock-app"

restored, skipped = [], []

for ej in glob.glob(os.path.join(HIST, "*", "entries.json")):
    try:
        j = json.load(open(ej, encoding="utf-8"))
    except Exception:
        continue
    res = urllib.parse.unquote(j.get("resource",""))
    if "korea-stock-app" not in res: 
        continue
    if not res.endswith((".ts",".tsx")):
        continue
    # file:///c:/Users/... -> 윈도우 경로
    path = res.replace("file:///","").replace("/", os.sep)
    if len(path) > 1 and path[1] == ":":
        path = path[0].upper() + path[1:]
    if "korea-stock-app" not in path:
        continue
    # 최신 스냅샷
    entries = sorted(j.get("entries",[]), key=lambda e: e.get("timestamp",0), reverse=True)
    if not entries: 
        continue
    snap = os.path.join(os.path.dirname(ej), entries[0]["id"])
    if not os.path.exists(snap):
        skipped.append((path,"snapshot missing"))
        continue
    raw = open(snap,"rb").read()
    # UTF-8 정상인지 확인 (한글 깨짐 = '?' 다수면 손상)
    try:
        txt = raw.decode("utf-8")
    except Exception as e:
        skipped.append((path,"not utf-8: %s"%e))
        continue
    qmark = txt.count("?")
    has_kr = any("\uac00" <= c <= "\ud7a3" for c in txt)
    restored.append((path, snap, len(raw), qmark, has_kr))

print("=== 복구 후보 (korea-stock-app History) ===")
for path, snap, size, qmark, has_kr in sorted(restored):
    rel = path.split("korea-stock-app"+os.sep)[-1]
    flag = "한글OK" if has_kr else "한글없음"
    print(f"{flag} | ?={qmark:4d} | {size:6d}B | {rel}  <= {os.path.basename(snap)}")
print(f"\n총 {len(restored)}개 후보, {len(skipped)}개 스킵")
for p,r in skipped:
    print("  SKIP:", p, r)
