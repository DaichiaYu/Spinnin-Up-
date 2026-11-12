#!/usr/bin/env python3
"""檢查 data/ 裡的資料有沒有互相對得上。用法：python3 tools/validate.py"""
import json, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
areas = {a["id"]: a for a in json.load(open(ROOT / "data/areas.json", encoding="utf-8"))["areas"]}
equip = {e["id"] for e in json.load(open(ROOT / "data/equipment.json", encoding="utf-8"))["equipment"]}
exs = json.load(open(ROOT / "data/exercises.json", encoding="utf-8"))["exercises"]
ids = [e["id"] for e in exs]
errors = []

def err(eid, msg):
    errors.append(f"{eid}: {msg}")

REQUIRED = ["id", "name", "name_en", "category", "region", "pattern", "mode", "primary", "secondary",
            "equipment", "upper_load", "sided", "level", "dose", "sets", "rest_sec", "effect",
            "setup", "cues", "avoid", "watch", "easier", "harder", "swaps", "easier_tip"]

if len(ids) != len(set(ids)):
    errors.append("有重複的 id")

for e in exs:
    eid = e.get("id", "?")
    for k in REQUIRED:
        if k not in e:
            err(eid, f"缺欄位 {k}")
    if e["category"] not in ("train", "warmup", "cooldown"):
        err(eid, "category 不對")
    if e["region"] not in ("lower", "core", "upper", "full"):
        err(eid, "region 不對")
    if e["mode"] not in ("hold", "reps"):
        err(eid, "mode 不對")
    if e["upper_load"] not in ("none", "light", "full"):
        err(eid, "upper_load 不對")
    if not 1 <= e["level"] <= 5:
        err(eid, "level 要在 1–5")
    d = e["dose"]
    if d["unit"] != ("sec" if e["mode"] == "hold" else "reps"):
        err(eid, "dose.unit 和 mode 對不上")
    if not d["min"] <= d["default"] <= d["max"]:
        err(eid, "dose 的 default 不在 min–max 之間")
    for a in e["primary"] + e["secondary"]:
        if a not in areas:
            err(eid, f"不認得的部位 {a}")
        elif areas[a]["kind"] != "muscle":
            err(eid, f"{a} 不是肌肉部位，不能放在 primary/secondary")
    if e["category"] == "train" and not e["primary"]:
        err(eid, "訓練動作要有 primary")
    for w in e["watch"]:
        if w["area"] not in areas:
            err(eid, f"watch 裡有不認得的部位 {w['area']}")
        if w["area"] in e["primary"]:
            err(eid, f"watch 的 {w['area']} 同時是 primary，會互相矛盾")
    for q in e["equipment"]:
        if q not in equip:
            err(eid, f"不認得的器材 {q}")
    for k in ("easier", "harder"):
        if e[k] is not None and e[k] not in ids:
            err(eid, f"{k} 指到不存在的動作 {e[k]}")
    for s in e["swaps"]:
        if s not in ids:
            err(eid, f"swaps 指到不存在的動作 {s}")
        if s == eid:
            err(eid, "swaps 不能指到自己")
    if not (ROOT / "assets/exercises" / f"{eid}.svg").exists():
        err(eid, "缺圖 assets/exercises/%s.svg" % eid)

if errors:
    print("\n".join(errors))
    sys.exit(1)
print(f"OK：{len(exs)} 個動作，{len(areas)} 個部位，{len(equip)} 種器材")
