#!/usr/bin/env python3
"""Build docs/exercise-coverage.md from approved facets and candidate metadata."""
import collections, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

def load(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))

approved = load("data/exercises.json")["exercises"]
facets = load("data/exercise-facets.json")["exercises"]
candidates = load("data/exercise-candidates.json")["candidates"]

def counts(values):
    c = collections.Counter(values)
    return sorted(c.items(), key=lambda x: (-x[1], x[0]))

def table(rows, a="項目", b="數量"):
    out = [f"| {a} | {b} |", "|---|---:|"]
    out += [f"| {k} | {v} |" for k,v in rows]
    return "\n".join(out)

ctx = counts(x for f in facets.values() for x in f["contexts"])
pos = counts(x for f in facets.values() for x in f["positions"])
special = counts(x for f in facets.values() for x in f["special"])
patterns = counts(c["facets"]["movement_pattern"] for c in candidates)
regions = counts(x for c in candidates for x in c["facets"]["body_regions"])

lines = [
"# Exercise library coverage",
"",
"這是工具產生的盤點，不代表候選動作已經可以直接推薦給使用者。",
"",
f"- Approved：{len(approved)}",
f"- External candidates：{len(candidates)}",
f"- Candidate movement pattern 尚未判定：{sum(1 for c in candidates if c['facets']['movement_pattern']=='unknown')}",
f"- 可能床上候選：{sum(1 for c in candidates if 'possible_bed_candidate' in c['facets']['special'])}",
f"- 頸部候選：{sum(1 for c in candidates if 'neck' in c['facets']['body_regions'])}",
f"- 戶外移動候選：{sum(1 for c in candidates if 'outdoor_move' in c['facets']['special'])}",
"",
"## Approved：場景",
table(ctx),
"",
"## Approved：姿勢",
table(pos),
"",
"## Approved：特殊搜尋標籤",
table(special),
"",
"## Candidate：movement patterns（前 25）",
table(patterns[:25]),
"",
"## Candidate：body regions",
table(regions),
"",
"## 目前明顯缺口",
"",
"- **臉部**：正式庫 0；不要從一般健身庫硬湊，之後另找有證據脈絡的來源。",
"- **頸部**：正式庫 0；候選池有少量，可優先人工審。",
"- **床上**：正式庫已有一批仰躺／側躺／趴姿動作，但候選的 bed 標籤仍只是 possible，需要逐個確認床墊穩定性是否影響動作。",
"- **戶外移動**：正式庫幾乎沒有；候選池有走、跑等 locomotion，後續應再補坡道、樓梯、走跑間歇等情境型內容。",
"- **足踝／足弓**：目前只有零散小腿和平衡動作，缺專門的足部控制、活動度與足弓相關內容。",
"- **limited grip**：正式庫只有少數可不靠手掌抓握的動作，應額外盤點。",
"",
"## 下一階段怎麼用",
"",
"先用 facets 查候選 → 人工看來源與動作本身 → 補中文名稱、setup/cues/avoid/watch/dose → 用 Spinnin-Up 自己的圖 → 才升成 approved。",
"",
"不要以「候選總數」當 KPI；優先補 coverage 缺口。",
]
(ROOT / "docs/exercise-coverage.md").write_text("\n".join(lines)+"\n", encoding="utf-8")
print("wrote docs/exercise-coverage.md")
