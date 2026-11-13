#!/usr/bin/env python3
"""Normalize yuhonas/free-exercise-db into Spinnin-Up's candidate schema.

Usage:
  python3 tools/import_free_exercise_db.py path/to/exercises.json [output.json]

The source file is intentionally not fetched at runtime: CI/offline agents should be able
to run deterministically from a local snapshot. Candidate facets are heuristic and remain
needs_review=true until promoted into the approved exercise library.
"""
import json, pathlib, re, sys

OUT_DEFAULT = pathlib.Path("data/exercise-candidates.json")

UPPER = {"biceps","triceps","shoulders","chest","middle back","lats","traps","forearms"}
LOWER = {"quadriceps","hamstrings","calves","glutes","adductors","abductors"}
CORE = {"abdominals","lower back"}

def uniq(xs):
    return list(dict.fromkeys(x for x in xs if x))

def regions(e):
    muscles = [str(x).lower() for x in e.get("primaryMuscles", []) + e.get("secondaryMuscles", [])]
    out = []
    if any(x in UPPER for x in muscles): out.append("upper")
    if any(x in LOWER for x in muscles): out.append("lower")
    if any(x in CORE for x in muscles): out.append("core")
    if "neck" in muscles: out.append("neck")
    return out or ["unknown"]

def pattern(name, category):
    n = name.lower()
    rules = [
        (r"neck.*(lateral|side bend|side flex)", "neck_lateral_flexion"),
        (r"neck.*(rotation|turn)", "neck_rotation"),
        (r"neck.*extension", "neck_extension"),
        (r"neck.*flexion|neck flexor", "neck_flexion"),
        (r"squat", "squat"), (r"deadlift|good morning|hip hinge", "hinge"),
        (r"lunge", "lunge"), (r"step[- ]?up|stair", "step"),
        (r"bridge|hip thrust", "bridge"), (r"calf raise|toe raise", "calf"),
        (r"abduct", "hip_abduction"), (r"adduct", "hip_adduction"),
        (r"leg extension", "knee_extension"), (r"row|pull[- ]?apart", "pull_horizontal"),
        (r"pull[- ]?up|chin[- ]?up|pulldown|lat pull", "pull_vertical"),
        (r"push[- ]?up|bench press|chest press", "push_horizontal"),
        (r"overhead press|shoulder press|military press|arnold press", "push_vertical"),
        (r"face pull|reverse fly|rear delt|scap", "scap_retraction"),
        (r"curl", "elbow_flexion"), (r"tricep|triceps|pushdown", "elbow_extension"),
        (r"carry|farmer|suitcase", "carry"), (r"grip|wrist", "grip"),
        (r"pallof|anti[- ]?rotation", "anti_rotation"), (r"side plank", "anti_lateral_flexion"),
        (r"plank|dead bug|hollow", "anti_extension"), (r"crunch|sit[- ]?up", "trunk_flexion"),
        (r"twist|rotation", "trunk_rotation"), (r"balance", "balance"),
        (r"run|jog|walk|sprint", "locomotion")
    ]
    for rx, value in rules:
        if re.search(rx, n): return value
    return "stretch" if category == "stretching" else "unknown"

def positions(e):
    t = (e.get("name","") + " " + " ".join(e.get("instructions", []))).lower()
    out = []
    checks = [
        (r"seated|sitting|sit on|sit at", "seated"),
        (r"lie on your back|lying on your back|supine", "supine"),
        (r"lie face down|lying face down|lie on your stomach|lying on your stomach|prone", "prone"),
        (r"lying on your side|lie on your side|side[- ]lying", "side_lying"),
        (r"half[- ]kneel", "half_kneeling"),
        (r"all fours|hands and knees|quadruped", "quadruped"),
        (r"plank", "plank"),
        (r"run|running|jog|walking|walk|sprint", "moving"),
    ]
    for rx, value in checks:
        if re.search(rx, t): out.append(value)
    if "half_kneeling" not in out and re.search(r"kneel|kneeling", t): out.append("kneeling")
    return uniq(out) or ["unknown"]

def impact(e):
    n = e.get("name","").lower()
    if re.search(r"jump|plyo|burpee|box jump|sprint", n): return "high"
    if re.search(r"run|jog|skipping", n): return "moderate"
    if re.search(r"walk|march|step", n): return "low"
    if e.get("category") == "stretching": return "none"
    return "unknown"

def hand_support(e):
    n = e.get("name","").lower()
    return "bodyweight" if re.search(r"push[- ]?up|plank|mountain climber|burpee|bear crawl|dip", n) else "unknown"

def sided(e):
    t = (e.get("name","") + " " + " ".join(e.get("instructions", []))).lower()
    if "alternat" in t: return "alternating"
    if re.search(r"single[- ]arm|single[- ]leg|one arm|one leg|one side|each side|switch sides|other side", t): return "unilateral"
    return "unknown"

def normalize(e):
    pos = positions(e)
    pat = pattern(e.get("name",""), e.get("category"))
    contexts = []
    if any(p in {"supine","prone","side_lying","quadruped","plank","kneeling","half_kneeling"} for p in pos):
        contexts.append("floor")
    if "seated" in pos: contexts.append("chair")
    if "moving" in pos and pat == "locomotion": contexts.append("outdoor")
    special = []
    eq = str(e.get("equipment") or "").lower()
    if any(p in {"supine","prone","side_lying"} for p in pos) and eq in {"","none","body only"}:
        special.append("possible_bed_candidate")
    if pat == "locomotion": special.append("outdoor_move")
    if not re.search(r"jump|plyo|burpee|sprint", e.get("name",""), re.I): special.append("possible_no_jump")
    imp = impact(e)
    return {
      "id": "free-exercise-db:" + e["id"],
      "source": "free-exercise-db",
      "source_id": e["id"],
      "source_url": "https://github.com/yuhonas/free-exercise-db/tree/main/exercises/" + e["id"],
      "name": e.get("name",""),
      "aliases": [],
      "source_category": e.get("category"),
      "source_level": e.get("level"),
      "source_force": e.get("force"),
      "source_mechanic": e.get("mechanic"),
      "source_equipment": e.get("equipment"),
      "source_primary_muscles": e.get("primaryMuscles", []),
      "source_secondary_muscles": e.get("secondaryMuscles", []),
      "facets": {
        "body_regions": regions(e),
        "movement_pattern": pat,
        "mode": "hold" if re.search(r"isometric|hold", e.get("name",""), re.I) else ("time" if e.get("category") == "stretching" else "reps"),
        "positions": pos,
        "contexts": uniq(contexts),
        "impact": imp,
        "hand_support": hand_support(e),
        "grip": "required" if eq not in {"","none","body only"} else "unknown",
        "overhead": True if re.search(r"overhead|military press|shoulder press|arnold press", e.get("name",""), re.I) else "unknown",
        "sided": sided(e),
        "balance_demand": "high" if re.search(r"balance|single[- ]leg|one[- ]leg", e.get("name",""), re.I) else "unknown",
        "space": "travel" if "moving" in pos else "unknown",
        "noise": "loud" if imp == "high" else ("quiet" if e.get("category") == "stretching" else "unknown"),
        "special": special,
      },
      "inference_confidence": "medium",
      "needs_review": True,
    }

def main():
    if len(sys.argv) < 2:
        raise SystemExit("usage: import_free_exercise_db.py INPUT_JSON [OUTPUT_JSON]")
    src = pathlib.Path(sys.argv[1])
    out = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else OUT_DEFAULT
    raw = json.loads(src.read_text(encoding="utf-8"))
    candidates = [normalize(e) for e in raw]
    doc = {
      "version": 1,
      "generated_from": {
        "source": "free-exercise-db",
        "repository": "yuhonas/free-exercise-db",
        "path": "dist/exercises.json",
        "source_count": len(raw),
        "license": "Unlicense / public domain",
      },
      "note": "外部候選池，不直接顯示給使用者。facets 多數由規則推測，needs_review=true 才能進正式庫。",
      "candidates": candidates,
    }
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(candidates)} candidates -> {out}")

if __name__ == "__main__":
    main()
