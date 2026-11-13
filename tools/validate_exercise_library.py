#!/usr/bin/env python3
"""Validate the external candidate pool and approved exercise facets."""
import json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
errors = []

def load(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))

approved = load("data/exercises.json")["exercises"]
approved_ids = {e["id"] for e in approved}
facets = load("data/exercise-facets.json")["exercises"]
candidate_doc = load("data/exercise-candidates.json")
candidates = candidate_doc["candidates"]

if set(facets) != approved_ids:
    errors.append("exercise-facets.json ids must exactly match data/exercises.json")

allowed_impact = {"none","low","moderate","high","unknown"}
allowed_support = {"none","optional","light","bodyweight","unknown"}
allowed_grip = {"none","optional","required","unknown"}
allowed_sided = {"bilateral","unilateral","alternating","unknown"}
allowed_balance = {"low","moderate","high","unknown"}
allowed_space = {"tiny","small","medium","travel","unknown"}
allowed_noise = {"quiet","moderate","loud","unknown"}

for eid, f in facets.items():
    for key in ("positions","contexts","impact","hand_support","grip","overhead","sided","balance_demand","space","noise","special"):
        if key not in f: errors.append(f"{eid}: missing facet {key}")
    if f.get("impact") not in allowed_impact: errors.append(f"{eid}: bad impact")
    if f.get("hand_support") not in allowed_support: errors.append(f"{eid}: bad hand_support")
    if f.get("grip") not in allowed_grip: errors.append(f"{eid}: bad grip")
    if f.get("sided") not in allowed_sided: errors.append(f"{eid}: bad sided")
    if f.get("balance_demand") not in allowed_balance: errors.append(f"{eid}: bad balance_demand")
    if f.get("space") not in allowed_space: errors.append(f"{eid}: bad space")
    if f.get("noise") not in allowed_noise: errors.append(f"{eid}: bad noise")

ids = [c.get("id") for c in candidates]
if len(ids) != len(set(ids)): errors.append("candidate ids are not unique")
for i, c in enumerate(candidates):
    cid = c.get("id") or f"candidate[{i}]"
    for key in ("source","source_id","name","facets","needs_review"):
        if key not in c: errors.append(f"{cid}: missing {key}")
    if c.get("needs_review") is not True:
        errors.append(f"{cid}: external candidates must remain needs_review=true until promoted")

if candidate_doc.get("generated_from",{}).get("source_count") != len(candidates):
    errors.append("candidate source_count does not match candidate count")

if errors:
    print("\n".join(errors))
    sys.exit(1)
print(f"OK: {len(approved_ids)} approved facets, {len(candidates)} external candidates")
