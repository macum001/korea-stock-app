import json, os, urllib.parse, glob, datetime, re

HIST = os.path.expandvars(r"%APPDATA%\Code\User\History")

# 손상된 패턴: // jp: 뒤에 ??? 같은 물음표 연속, 또는 한글 자리에 ? 가 박힌 흔적
DAMAGE = re.compile(r'//\s*jp:\s*\?|[가-힣]\?{2,}|\?{3,}')

rows = []
for ej in glob.glob(os.path.join(HIST, "*", "entries.json")):
    try:
        j = json.load(open(ej, encoding="utf-8"))
    except Exception:
        continue
    res = urllib.parse.unquote(j.get("resource",""))
    if "korea-stock-app" not in res or not res.endswith((".ts",".tsx")):
        continue
    path = res.replace("file:///","").replace("/", os.sep)
    if len(path)>1 and path[1]==":":
        path = path[0].upper()+path[1:]
    entries = sorted(j.get("entries",[]), key=lambda e:e.get("timestamp",0), reverse=True)
    if not entries:
        continue
    e0 = entries[0]
    snap = os.path.join(os.path.dirname(ej), e0["id"])
    if not os.path.exists(snap):
        continue
    txt = open(snap,"rb").read().decode("utf-8","replace")
    ts = datetime.datetime.fromtimestamp(e0["timestamp"]/1000).strftime("%m-%d %H:%M")
    damaged = len(DAMAGE.findall(txt))
    rel = path.split("korea-stock-app"+os.sep)[-1]
    rows.append((rel, ts, damaged))

print(f"{'파일':<60} {'최신스냅':<14} {'손상흔적'}")
print("-"*90)
for rel, ts, dmg in sorted(rows):
    mark = "  ⚠ 손상" if dmg>0 else "  깨끗"
    print(f"{rel:<60} {ts:<14} {dmg:>3}{mark}")
