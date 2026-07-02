import subprocess, os
files = subprocess.check_output(["git","diff","--name-only"], text=True).strip().splitlines()
print(f"{'파일':<55} {'커밋(깨짐)':>10} {'복구본':>8} {'차이':>7}")
print("-"*85)
for f in files:
    try:
        head = subprocess.check_output(["git","show",f"HEAD:{f}"], text=True, errors="replace").count("\n")
    except Exception:
        head = 0
    try:
        cur = open(f, encoding="utf-8", errors="replace").read().count("\n")
    except Exception:
        cur = 0
    diff = cur - head
    mark = "  ⚠축소" if diff < -20 else ""
    print(f"{f:<55} {head:>10} {cur:>8} {diff:>+7}{mark}")
