import json, os, urllib.parse, glob, shutil, datetime

HIST = os.path.expandvars(r"%APPDATA%\Code\User\History")
PROJ = r"C:\Users\macum\Desktop\korea-stock-app"
BACKUP = os.path.join(PROJ, "_corrupt_backup_" + datetime.datetime.now().strftime("%Y%m%d_%H%M%S"))
os.makedirs(BACKUP, exist_ok=True)

plan = []
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
    if "korea-stock-app" not in path:
        continue
    entries = sorted(j.get("entries",[]), key=lambda e:e.get("timestamp",0), reverse=True)
    if not entries:
        continue
    snap = os.path.join(os.path.dirname(ej), entries[0]["id"])
    if os.path.exists(snap):
        plan.append((path, snap))

print(f"=== {len(plan)}개 파일 복구 시작 (백업: {BACKUP}) ===\n")
done = 0
for dest, snap in sorted(plan):
    if not os.path.exists(dest):
        print(f"  ⚠ 대상없음(스킵): {dest}")
        continue
    # 백업 (현재 깨진 파일 보존)
    rel = dest.split("korea-stock-app"+os.sep)[-1]
    bdest = os.path.join(BACKUP, rel)
    os.makedirs(os.path.dirname(bdest), exist_ok=True)
    shutil.copy2(dest, bdest)
    # 복구 (UTF-8 그대로 바이트 복사)
    shutil.copy2(snap, dest)
    done += 1
    print(f"  ✔ {rel}")

print(f"\n{done}개 복구 완료. 원본(깨진) 백업: {BACKUP}")
print("다음: git diff 로 로직 확인 후 vite 재시작")
