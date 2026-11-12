#!/usr/bin/env python3
"""產生動作線稿 SVG。用法：python3 tools/build_figures.py

每個姿勢用「髖的位置 + 各段肢體的角度」描述，程式算出關節位置再畫出來，
所以所有圖的比例、線條粗細、顏色都一致。要改姿勢就改 POSES 裡的數字。

角度是螢幕方向：0 = 往右、90 = 往下、-90 = 往上、180 = 往左。
橘色 = 主要發力的位置。
"""
import math, pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "assets" / "exercises"
W, H, GROUND = 240, 180, 162
NEAR, FAR, PROP, ACCENT, FLOOR = "#2b3440", "#aab4be", "#7b8794", "#f0791f", "#cfd6dd"
TOWEL = "#4c9aa8"
L = dict(torso=44, neck=14, upper=24, fore=22, thigh=36, shin=36, foot=11)
SW = dict(torso=14, upper=8, fore=7.5, thigh=11, shin=9.5, foot=7)
HEAD_R = 9


def step(p, ang, length):
    a = math.radians(ang)
    return (p[0] + math.cos(a) * length, p[1] + math.sin(a) * length)


def line(a, b, color, width, extra=""):
    return (f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" '
            f'stroke="{color}" stroke-width="{width}" stroke-linecap="round" {extra}/>')


def circle(c, r, fill, extra=""):
    return f'<circle cx="{c[0]:.1f}" cy="{c[1]:.1f}" r="{r}" fill="{fill}" {extra}/>'


def solve(pose):
    """算出所有關節位置。"""
    dx, dy = pose.get("depth", (5, -3))
    j = {}
    j["hip"] = pose["hip"]
    j["shoulder"] = step(j["hip"], pose["torso"], L["torso"])
    j["head"] = step(j["shoulder"], pose.get("head", pose["torso"]), L["neck"])
    j["f_hip"] = (j["hip"][0] + dx, j["hip"][1] + dy)
    j["f_shoulder"] = (j["shoulder"][0] + dx, j["shoulder"][1] + dy)
    for side, root_s, root_h in (("n", "shoulder", "hip"), ("f", "f_shoulder", "f_hip")):
        arm = pose.get(f"{side}_arm") or pose["n_arm"]
        leg = pose.get(f"{side}_leg") or pose["n_leg"]
        j[f"{side}_elbow"] = step(j[root_s], arm[0], L["upper"])
        j[f"{side}_hand"] = step(j[f"{side}_elbow"], arm[1], L["fore"])
        j[f"{side}_knee"] = step(j[root_h], leg[0], L["thigh"])
        j[f"{side}_ankle"] = step(j[f"{side}_knee"], leg[1], L["shin"])
        j[f"{side}_toe"] = step(j[f"{side}_ankle"], leg[2], L["foot"])
    return j


def spot(j, spec):
    """spec = (關節A, 關節B, 比例, 垂直偏移, 半徑x, 半徑y)。在 A→B 的某個位置旁邊畫一個橘色區塊。"""
    a, b, t, off, rx, ry = spec
    A, B = j[a], j[b]
    x, y = A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t
    ang = math.atan2(B[1] - A[1], B[0] - A[0])
    x += -math.sin(ang) * off
    y += math.cos(ang) * off
    deg = math.degrees(ang)
    return (f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="{rx}" ry="{ry}" fill="{ACCENT}" '
            f'opacity="0.9" transform="rotate({deg:.0f} {x:.1f} {y:.1f})"/>')


def side_figure(pose):
    j = solve(pose)
    hl = set(pose.get("hl", []))
    out = []
    segs = lambda s: [
        (f"{s}_thigh", "f_hip" if s == "f" else "hip", f"{s}_knee", "thigh"),
        (f"{s}_shin", f"{s}_knee", f"{s}_ankle", "shin"),
        (f"{s}_foot", f"{s}_ankle", f"{s}_toe", "foot"),
        (f"{s}_upper", "f_shoulder" if s == "f" else "shoulder", f"{s}_elbow", "upper"),
        (f"{s}_fore", f"{s}_elbow", f"{s}_hand", "fore"),
    ]
    hide = set(pose.get("hide", []))
    # 遠側肢體（灰色）
    for name, a, b, kind in segs("f"):
        if name in hide:
            continue
        out.append(line(j[a], j[b], ACCENT if name in hl else FAR, SW[kind]))
    # 近側的腿
    near = segs("n")
    order = pose.get("order", "legs-torso-arms")
    def draw(names):
        for name, a, b, kind in near:
            if name.split("_")[1] in names and name not in hide:
                out.append(line(j[a], j[b], "#ffffff", SW[kind] + 3))
                out.append(line(j[a], j[b], ACCENT if name in hl else NEAR, SW[kind]))
    def torso():
        out.append(line(j["hip"], j["shoulder"], "#ffffff", SW["torso"] + 3))
        out.append(line(j["hip"], j["shoulder"], NEAR, SW["torso"]))
        out.append(circle(j["head"], HEAD_R + 1.5, "#ffffff"))
        out.append(circle(j["head"], HEAD_R, NEAR))
    for part in order.split("-"):
        if part == "legs":
            draw({"thigh", "shin", "foot"})
        elif part == "torso":
            torso()
            for s in pose.get("spots_mid", []):
                out.append(spot(j, s))
        elif part == "arms":
            draw({"upper", "fore"})
    for s in pose.get("spots", []):
        out.append(spot(j, s))
    return j, out


def back_figure(p):
    """正面／背面的簡單人形，用明確的座標畫。"""
    cx, sy = p["cx"], p["shoulder_y"]
    hy = sy + 46
    out = []
    for hipx, foot in ((cx - 9, p["feet"][0]), (cx + 9, p["feet"][1])):
        knee = ((hipx + foot[0]) / 2, (hy + foot[1]) / 2)
        out.append(line((hipx, hy), knee, NEAR, SW["thigh"]))
        out.append(line(knee, foot, NEAR, SW["shin"]))
    out.append(f'<rect x="{cx-15}" y="{sy-5}" width="30" height="{hy-sy+10}" rx="11" fill="{NEAR}"/>')
    out.append(circle((cx, sy - 20), HEAD_R, NEAR))
    for s in p.get("spots", []):
        out.append(f'<ellipse cx="{s[0]}" cy="{s[1]}" rx="{s[2]}" ry="{s[3]}" fill="{ACCENT}" opacity="0.92"/>')
    for sx, (elbow, hand) in ((cx - 15, p["arms"][0]), (cx + 15, p["arms"][1])):
        out.append(line((sx, sy), elbow, "#ffffff", SW["upper"] + 3))
        out.append(line(elbow, hand, "#ffffff", SW["fore"] + 3))
        out.append(line((sx, sy), elbow, NEAR, SW["upper"]))
        out.append(line(elbow, hand, NEAR, SW["fore"]))
    return out


# ---- 道具 ----
def wall(x):
    return [f'<rect x="{x}" y="14" width="6" height="{GROUND-14}" fill="{PROP}" opacity="0.55"/>']

def mat(x1=30, x2=214):
    return [line((x1, GROUND - 1.5), (x2, GROUND - 1.5), "#9fd0c8", 4)]

def chair(x=58, seat=127):
    return [line((x, 78), (x, GROUND), PROP, 4), line((x, seat), (x + 44, seat), PROP, 5),
            line((x + 42, seat), (x + 42, GROUND), PROP, 4)]

def post(x, y1=40):
    return [line((x, y1), (x, GROUND), PROP, 5)]

def band(a, b):
    return [line(a, b, "#d6336c", 3, 'stroke-dasharray="1 5"')]

def dumbbell(c):
    x, y = c
    return [line((x - 7, y), (x + 7, y), PROP, 3),
            f'<rect x="{x-10}" y="{y-5}" width="5" height="10" rx="1.5" fill="{PROP}"/>',
            f'<rect x="{x+5}" y="{y-5}" width="5" height="10" rx="1.5" fill="{PROP}"/>']


STAND_LEG = (90, 90, 0)
HANG_ARM = (88, 84)
SUPINE = dict(hip=(124, 150), torso=180, head=180, depth=(4, -3))
BENT_ON_FLOOR = (-46, 76, 10)

POSES = {
    "wall-sit": dict(hip=(74, 121), torso=-90, n_leg=(0, 90, 0), n_arm=(84, 80),
                     hl=["n_thigh", "f_thigh"], props=wall(58)),
    "glute-bridge-hold": dict(hip=(118, 133), torso=155, head=180, n_leg=(-22, 87, 0), n_arm=(8, 0),
                              depth=(4, -3), order="arms-legs-torso",
                              spots=[("hip", "n_knee", 0.0, 7, 12, 7)], props=mat()),
    "single-leg-glute-bridge-hold": dict(hip=(118, 133), torso=155, head=180, n_leg=(-22, 87, 0),
                                         f_leg=(-22, -22, -90), n_arm=(8, 0), depth=(4, -3),
                                         order="arms-legs-torso",
                                         spots=[("hip", "n_knee", 0.0, 7, 12, 7)], props=mat()),
    "split-squat-hold": dict(hip=(116, 114), torso=-88, n_leg=(15, 88, 0), f_leg=(112, 158, 30),
                             n_arm=HANG_ARM, depth=(0, 0), hl=["n_thigh"],
                             spots=[("hip", "shoulder", 0.0, 7, 8, 7)]),
    "chair-sit-to-stand": dict(hip=(98, 116), torso=-64, n_leg=(10, 92, 0), n_arm=(32, 0),
                               hl=["n_thigh"], spots=[("hip", "shoulder", 0.0, 8, 8, 7)],
                               props=chair(54, 131)),
    "seated-knee-extension-hold": dict(hip=(84, 119), torso=-90, n_leg=(0, 0, -80), f_leg=(0, 90, 0),
                                       n_arm=(92, 88), depth=(3, 0), hl=["n_thigh"],
                                       props=chair(62, 128)),
    "hip-hinge": dict(hip=(96, 88), torso=-25, n_leg=(80, 97, 0), n_arm=(96, 92),
                      spots=[("hip", "n_knee", 0.5, 7, 13, 5), ("hip", "shoulder", 0.0, 8, 8, 7)]),
    "calf-raise-hold": dict(hip=(110, 80), torso=-90, n_leg=(90, 90, 40), n_arm=(12, -10),
                            f_arm=HANG_ARM, spots=[("n_knee", "n_ankle", 0.4, 6, 11, 5)],
                            props=wall(160)),
    "side-lying-leg-raise-hold": dict(hip=(126, 150), torso=180, head=180, n_leg=(-20, -20, -100),
                                      f_leg=(2, 2, -60), n_arm=(-6, 6), f_arm=(184, 180),
                                      depth=(0, 2), order="legs-torso-arms",
                                      spots=[("hip", "n_knee", 0.05, -6, 9, 6)], props=mat()),
    "single-leg-stand": dict(hip=(112, 86), torso=-90, n_leg=STAND_LEG, f_leg=(10, 95, 10),
                             n_arm=(100, 62),
                             spots=[("hip", "n_knee", 0.05, 6, 8, 7), ("n_ankle", "n_toe", 0.3, 0, 8, 5)]),
    "single-leg-tabletop-hold": dict(**SUPINE, n_leg=(-90, 0, -80), f_leg=BENT_ON_FLOOR, n_arm=(8, 0),
                                     order="arms-legs-torso",
                                     spots=[("hip", "shoulder", 0.42, 5, 13, 5)], props=mat()),
    "tabletop-hold": dict(**SUPINE, n_leg=(-90, 0, -80), n_arm=(8, 0), order="arms-legs-torso",
                          spots=[("hip", "shoulder", 0.42, 5, 13, 5)], props=mat()),
    "dead-bug": dict(**SUPINE, n_leg=(-90, 0, -80), f_leg=(-18, -14, -80), n_arm=(-90, -90),
                     f_arm=(-158, -160), order="legs-torso-arms",
                     spots=[("hip", "shoulder", 0.42, 5, 13, 5)], props=mat()),
    "forearm-plank": dict(hip=(128, 134), torso=192, head=186, n_leg=(12, 12, 85), n_arm=(90, 180),
                          depth=(3, -2), spots=[("hip", "shoulder", 0.4, -6, 14, 5)], props=mat()),
    "band-row-hold": dict(hip=(92, 86), torso=-90, n_leg=(88, 92, 0), n_arm=(112, 8),
                          spots_mid=[("hip", "shoulder", 0.62, 5, 12, 5)],
                          props=post(204, 50), band_to=(204, 78)),
    "prone-w-hold": dict(hip=(138, 151), torso=180, head=180, n_leg=(0, 0, 25), n_arm=(-32, 180),
                         depth=(2, -2), spots=[("hip", "shoulder", 0.78, 6, 11, 5)], props=mat()),
    "wall-press-hold": dict(hip=(112, 88), torso=-74, n_leg=(105, 105, 0), n_arm=(22, -24),
                            depth=(4, -3), hl=["n_upper"],
                            spots_mid=[("hip", "shoulder", 0.78, 5, 9, 5)], props=wall(174)),
    "dumbbell-curl-hold": dict(hip=(108, 86), torso=-90, n_leg=STAND_LEG, n_arm=(90, 0),
                               f_arm=HANG_ARM, hl=["n_upper"], dumbbell_at="n_hand"),
    "towel-curl-hold": dict(hip=(108, 86), torso=-90, n_leg=STAND_LEG, n_arm=(90, 0), hl=["n_upper"],
                            strap_to="n_toe"),
    "front-carry-hold": dict(hip=(108, 86), torso=-90, n_leg=STAND_LEG, n_arm=(72, -25), hl=["n_upper"],
                             spots_mid=[("hip", "shoulder", 0.75, 5, 9, 5)], bag_at=("n_hand", -14, -22, 20, 28)),
    "suitcase-carry-hold": dict(hip=(108, 86), torso=-90, n_leg=STAND_LEG, n_arm=(72, 80), f_arm=HANG_ARM,
                                hl=["n_fore"], spots_mid=[("hip", "shoulder", 0.42, -2, 13, 6)],
                                bag_at=("n_hand", -10, 3, 20, 24)),
    "step-up": dict(hip=(102, 84), torso=-80, n_leg=(23, 90, 0), f_leg=STAND_LEG, n_arm=HANG_ARM,
                    depth=(4, 2), hl=["n_thigh"], spots=[("hip", "shoulder", 0.0, 8, 8, 7)],
                    props=[f'<rect x="118" y="141" width="56" height="{GROUND-141}" rx="3" fill="{PROP}" opacity="0.6"/>']),
    "pillow-squeeze-hold": dict(**SUPINE, n_leg=BENT_ON_FLOOR, n_arm=(8, 0), order="arms-legs-torso",
                                spots=[("hip", "n_knee", 0.55, 7, 11, 4)], pillow_at="n_knee", props=mat()),
    "march-in-place": dict(hip=(116, 86), torso=-90, n_leg=(8, 90, 10), f_leg=STAND_LEG,
                           n_arm=(115, 80), f_arm=(55, -15)),
    "supine-breathing": dict(**SUPINE, n_leg=BENT_ON_FLOOR, n_arm=(15, -45), order="legs-torso-arms",
                             props=mat()),
}

BACK_POSES = {
    # 背面：雙手往兩邊拉開，橘色在兩片肩胛骨之間
    "band-pull-apart-hold": dict(cx=120, shoulder_y=58, feet=((108, 158), (132, 158)),
                                 arms=(((80, 60), (56, 60)), ((160, 60), (184, 60))),
                                 spots=[(120, 68, 10, 8), (104, 57, 5, 4), (136, 57, 5, 4)],
                                 band=((56, 60), (184, 60))),
    # 正面：彈力帶從左邊拉過來，雙手往正前方推（手臂朝向畫面外，所以看起來短）
    "towel-pull-apart-hold": dict(cx=120, shoulder_y=58, feet=((108, 158), (132, 158)),
                                  arms=(((86, 66), (66, 62)), ((154, 66), (174, 62))),
                                  spots=[(120, 68, 10, 8), (104, 57, 5, 4), (136, 57, 5, 4)],
                                  towel=((66, 62), (174, 62))),
    "band-anti-rotation-hold": dict(cx=128, shoulder_y=58, feet=((114, 158), (142, 158)),
                                    arms=(((116, 72), (126, 80)), ((140, 72), (130, 80))),
                                    spots=[(128, 92, 13, 9)],
                                    band=((40, 80), (124, 80)), post=40),
}


def svg(body, title):
    floor = line((14, GROUND + 1.5), (W - 14, GROUND + 1.5), FLOOR, 2)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{title}">'
            f'{floor}{"".join(body)}</svg>\n')


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, pose in POSES.items():
        j, fig = side_figure(pose)
        body = list(pose.get("props", []))
        if "band_to" in pose:
            body += band(j["n_hand"], pose["band_to"])
        body += fig
        if "dumbbell_at" in pose:
            body += dumbbell(j[pose["dumbbell_at"]])
        if "strap_to" in pose:
            body += [line(j["n_hand"], j[pose["strap_to"]], TOWEL, 4)]
        if "bag_at" in pose:
            jn, dx, dy, w, h = pose["bag_at"]
            x, y = j[jn][0] + dx, j[jn][1] + dy
            body += [f'<rect x="{x:.1f}" y="{y:.1f}" width="{w}" height="{h}" rx="5" fill="{PROP}"/>']
        if "pillow_at" in pose:
            x, y = j[pose["pillow_at"]]
            body += [f'<ellipse cx="{x+4:.1f}" cy="{y+2:.1f}" rx="9" ry="12" fill="{TOWEL}" opacity="0.95"/>']
        (OUT / f"{name}.svg").write_text(svg(body, name), encoding="utf-8")
    for name, p in BACK_POSES.items():
        body = []
        if "post" in p:
            body += post(p["post"], 44)
        fig = back_figure(p)
        if "towel" in p:
            body += fig + [line(p["towel"][0], p["towel"][1], TOWEL, 4)]
        elif name == "band-pull-apart-hold":
            body += fig + band(*p["band"])
        else:
            body += fig + band(*p["band"]) + [circle((127, 80), 5, NEAR)]
        (OUT / f"{name}.svg").write_text(svg(body, name), encoding="utf-8")
    print(f"畫好 {len(POSES) + len(BACK_POSES)} 張圖 → {OUT}")


if __name__ == "__main__":
    build()
