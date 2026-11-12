#!/usr/bin/env python3
"""把動作資料和圖組成一頁可以直接打開的「動作總覽」。用法：python3 tools/build_catalog.py
輸出 catalog.html（單一檔案，不需要網路，可以直接傳到手機打開）。"""
import json, pathlib, html

ROOT = pathlib.Path(__file__).resolve().parent.parent
areas = {a["id"]: a["name"] for a in json.load(open(ROOT / "data/areas.json", encoding="utf-8"))["areas"]}
equip = {e["id"]: e["name"] + (f"（可用{e['substitute']}代替）" if e.get("substitute") else "") for e in json.load(open(ROOT / "data/equipment.json", encoding="utf-8"))["equipment"]}
exs = json.load(open(ROOT / "data/exercises.json", encoding="utf-8"))["exercises"]
names = {e["id"]: e["name"] for e in exs}
REGION = {"lower": "下半身", "core": "核心", "upper": "上半身", "full": "暖身／收操"}
LOAD = {"none": "手不用承重", "light": "手輕度出力", "full": "手要撐體重"}
esc = html.escape


def li(items):
    return "".join(f"<li>{esc(i)}</li>" for i in items)


def card(e):
    img = (ROOT / "assets/exercises" / f"{e['id']}.svg").read_text(encoding="utf-8")
    d = e["dose"]
    dose = f"{d['default']} {'秒' if d['unit'] == 'sec' else '下'} × {e['sets']} 組" + ("（每邊）" if e["sided"] else "")
    prim = "".join(f'<span class="chip p">{esc(areas[a])}</span>' for a in e["primary"])
    sec = "".join(f'<span class="chip">{esc(areas[a])}</span>' for a in e["secondary"])
    eq = "；".join(equip[q] for q in e["equipment"])
    watch = "".join(f"<li><b>{esc(areas[w['area']])}</b>：{esc(w['meaning'])}</li>" for w in e["watch"])
    links = []
    if e["easier"]:
        links.append(f"簡單一點：{esc(names[e['easier']])}")
    if e["harder"]:
        links.append(f"難一點：{esc(names[e['harder']])}")
    if e["swaps"]:
        links.append("可以換成：" + "、".join(esc(names[s]) for s in e["swaps"]))
    more = "".join(f"<p class='meta'>{l}</p>" for l in links)
    return f"""
<article class="card" data-region="{e['region']}">
  <div class="fig">{img}</div>
  <div class="body">
    <h2>{esc(e['name'])} <small>{esc(e['name_en'])}</small></h2>
    <p class="meta">{REGION[e['region']]}｜難度 {e['level']}/5｜{dose}｜{LOAD[e['upper_load']]}</p>
    <p class="meta">器材：{esc(eq)}</p>
    <div class="chips">{prim}{sec}</div>
    <p class="effect">{esc(e['effect'])}</p>
    <details><summary>怎麼做、注意什麼</summary>
      <h3>步驟</h3><ol>{li(e['setup'])}</ol>
      <h3>提示</h3><ul>{li(e['cues'])}</ul>
      {'<h3>避免</h3><ul>' + li(e['avoid']) + '</ul>' if e['avoid'] else ''}
      {'<h3>如果這些地方有感覺</h3><ul>' + watch + '</ul>' if watch else ''}
      {'<p class="meta">太難的話：' + esc(e['easier_tip']) + '</p>' if e['easier_tip'] else ''}
      {more}
    </details>
  </div>
</article>"""


order = {"full": 3, "lower": 0, "core": 1, "upper": 2}
cards = "".join(card(e) for e in sorted(exs, key=lambda e: (order[e["region"]], e["level"])))
page = f"""<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="data:,">
<title>動作總覽</title>
<style>
:root{{--bg:#f6f4ef;--card:#fff;--ink:#232a33;--mute:#667080;--line:#e3e0d8;--accent:#f0791f;--accent-bg:#fdebd9}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,"PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif}}
header{{padding:20px 16px 8px;max-width:960px;margin:auto}}
h1{{font-size:1.5rem;margin:0 0 4px}}
header p{{margin:0;color:var(--mute);font-size:.92rem}}
.legend{{display:inline-block;width:.8em;height:.8em;border-radius:50%;background:var(--accent);vertical-align:-1px}}
nav{{position:sticky;top:0;background:var(--bg);padding:10px 16px;display:flex;gap:8px;overflow-x:auto;max-width:960px;margin:auto;z-index:2}}
nav button{{flex:none;border:1px solid var(--line);background:var(--card);color:var(--ink);padding:8px 14px;border-radius:999px;font:inherit;font-size:.92rem;cursor:pointer}}
nav button[aria-pressed=true]{{background:var(--ink);color:#fff;border-color:var(--ink)}}
nav button:focus-visible,summary:focus-visible{{outline:2px solid var(--accent);outline-offset:2px}}
main{{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;padding:6px 16px 40px;max-width:960px;margin:auto}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}}
.fig{{background:#fbfaf7;border-bottom:1px solid var(--line);padding:6px 10px}}
.fig svg{{display:block;width:100%;height:auto}}
.body{{padding:12px 14px 14px}}
h2{{font-size:1.12rem;margin:0}}
h2 small{{font-weight:400;color:var(--mute);font-size:.8rem;margin-left:4px}}
h3{{font-size:.92rem;margin:12px 0 2px}}
.meta{{color:var(--mute);font-size:.86rem;margin:2px 0}}
.chips{{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}}
.chip{{font-size:.8rem;padding:2px 9px;border-radius:999px;border:1px solid var(--line);color:var(--mute)}}
.chip.p{{background:var(--accent-bg);border-color:#f6c9a0;color:#8a3d05;font-weight:600}}
.effect{{margin:6px 0}}
details{{border-top:1px solid var(--line);margin-top:10px;padding-top:8px}}
summary{{cursor:pointer;color:var(--mute);font-size:.92rem;padding:4px 0}}
ol,ul{{margin:2px 0;padding-left:1.3em;font-size:.94rem}}
footer{{max-width:960px;margin:auto;padding:0 16px 40px;color:var(--mute);font-size:.84rem}}
</style></head><body>
<header><p style="margin:0 0 6px"><a href="./" style="color:var(--mute)">← 回到課表</a></p><h1>動作總覽</h1>
<p>目前有 {len(exs)} 個動作。<span class="legend"></span> 橘色和橘色標籤是主要發力的位置，灰色標籤是會一起用到的部位。</p></header>
<nav aria-label="篩選部位">
<button data-f="all" aria-pressed="true">全部</button><button data-f="lower" aria-pressed="false">下半身</button><button data-f="core" aria-pressed="false">核心</button><button data-f="upper" aria-pressed="false">上半身</button><button data-f="full" aria-pressed="false">暖身／收操</button>
</nav>
<main>{cards}</main>
<footer>內容是一般訓練常識的整理，以個人狀況為準；有疼痛或疑慮，請洽自己的物理治療師或醫師。</footer>
<script>
document.querySelectorAll('nav button').forEach(function(b){{b.addEventListener('click',function(){{
  document.querySelectorAll('nav button').forEach(function(x){{x.setAttribute('aria-pressed',x===b)}});
  document.querySelectorAll('.card').forEach(function(c){{c.hidden=b.dataset.f!=='all'&&c.dataset.region!==b.dataset.f}});
}})}});
</script>
</body></html>
"""
(ROOT / "catalog.html").write_text(page, encoding="utf-8")
print("寫好 catalog.html")
