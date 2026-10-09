#!/usr/bin/env python3
"""Draws Pager's mascot once (a classic black pager with a green screen and a smile) and writes everything made from it:
  brand/pager-character.svg  the pager alone on a transparent background (desktop icon, tray)
  brand/pager-mascot.svg     the pager on the teal tile (web icons)  -> also app/public/icon.svg
  android drawables          pager_body / pager_waves / pager_ring / pager_shadow, launcher + notification icons
Run from the repo root:  python3 brand/make-brand.py
The in-app animated mascot (app/src/ui/Mascot.tsx) is drawn from the same numbers."""
import shutil

RES = "android/app/src/main/res"
NS = 'xmlns:android="http://schemas.android.com/apk/res/android" xmlns:aapt="http://schemas.android.com/aapt"'
INK, RIM, BEZEL, LCD_INK = "#0a0b0c", "#6b7a85", "#0b0c0d", "#0b4a22"

def rect(x, y, w, h, r):
    return f"M{x+r},{y} H{x+w-r} A{r},{r} 0 0 1 {x+w},{y+r} V{y+h-r} A{r},{r} 0 0 1 {x+w-r},{y+h} H{x+r} A{r},{r} 0 0 1 {x},{y+h-r} V{y+r} A{r},{r} 0 0 1 {x+r},{y} Z"
def ellipse(cx, cy, rx, ry):
    return f"M{cx-rx},{cy} A{rx},{ry} 0 1 0 {cx+rx},{cy} A{rx},{ry} 0 1 0 {cx-rx},{cy} Z"

def P(d, fill=None, stroke=None, sw=None, alpha=None, falpha=None, grad=None):
    return dict(d=d, fill=fill, stroke=stroke, sw=sw, alpha=alpha, falpha=falpha, grad=grad)

GRADS = {  # name -> (y0, y1, top, bottom)
    "gbody": (150, 382, "#3a4046", "#14161a"),
    "glcd": (184, 290, "#8ceb99", "#37a552"),
}

SHADOW = [P(ellipse(256, 424, 150, 12), fill="#000000", falpha=0.25)]
BODY = [
    P(ellipse(190, 396, 30, 15), fill="#FFFFFF", stroke=INK, sw=7), P(ellipse(322, 396, 30, 15), fill="#FFFFFF", stroke=INK, sw=7),
    P(rect(76, 150, 360, 232, 56), fill="#222", stroke=RIM, sw=6, grad="gbody"),
    P(rect(96, 168, 262, 152, 28), fill=BEZEL),
    P(rect(112, 184, 230, 106, 14), fill="#5bd46f", grad="glcd"),
    P("M128,198 Q162,190 202,192", stroke="#E3FFE8", sw=6, alpha=0.5),
    # the face: happy closed eyes, blush, open smile
    P("M168,234 Q185,206 202,234", stroke=LCD_INK, sw=11), P("M252,234 Q269,206 286,234", stroke=LCD_INK, sw=11),
    P(ellipse(160, 254, 13, 7), fill="#FF7A9C", falpha=0.6), P(ellipse(294, 254, 13, 7), fill="#FF7A9C", falpha=0.6),
    P("M211,246 Q227,276 243,246 Z", fill=LCD_INK, stroke=LCD_INK, sw=5),
    # buttons: up / down on the right, left / right / red dot below the screen, the green-line button
    P(rect(366, 168, 48, 152, 24), fill=BEZEL),
    P("M390,196 L379,222 L401,222 Z", fill="#FFFFFF"), P("M379,266 L401,266 L390,292 Z", fill="#FFFFFF"), P("M372,244 H408", stroke="#2B3035", sw=3),
    P("M132,305 L148,296 V314 Z", fill="#FFFFFF"), P("M192,296 L208,305 L192,314 Z", fill="#FFFFFF"),
    P("M164,296 V314 M226,296 V314", stroke="#2B3035", sw=3), P(ellipse(262, 305, 9, 9), fill="#EC3B36"),
    P(rect(366, 340, 56, 32, 16), fill=BEZEL, stroke=RIM, sw=4), P("M380,356 H408", stroke="#A6E35B", sw=6),
]
WAVES = [P("M52,200 Q22,266 52,332", stroke="#D5FBF4", sw=14), P("M460,200 Q490,266 460,332", stroke="#D5FBF4", sw=14),
         P("M28,176 Q-8,266 28,356", stroke="#D5FBF4", sw=14, alpha=0.65), P("M484,176 Q520,266 484,356", stroke="#D5FBF4", sw=14, alpha=0.65)]
RING = [P("M300,116 l16,-16", stroke="#FFFFFF", sw=9), P("M322,134 l22,-6", stroke="#FFFFFF", sw=9), P("M212,116 l-16,-16", stroke="#FFFFFF", sw=9), P("M190,134 l-22,-6", stroke="#FFFFFF", sw=9)]

# ---- SVG ----------------------------------------------------------------------------------------------------------------
def svg_part(p):
    a = [f'd="{p["d"]}"']
    a.append(f'fill="url(#{p["grad"]})"' if p["grad"] else (f'fill="{p["fill"]}"' if p["fill"] else 'fill="none"'))
    if p["stroke"]: a += [f'stroke="{p["stroke"]}"', f'stroke-width="{p["sw"]}"', 'stroke-linecap="round"', 'stroke-linejoin="round"']
    if p["alpha"] is not None: a.append(f'stroke-opacity="{p["alpha"]}"')
    if p["falpha"] is not None: a.append(f'fill-opacity="{p["falpha"]}"')
    return f"<path {' '.join(a)}/>"

DEFS = "<defs>" + "".join(f'<linearGradient id="{n}" gradientUnits="userSpaceOnUse" x1="0" y1="{y0}" x2="0" y2="{y1}"><stop offset="0" stop-color="{c0}"/><stop offset="1" stop-color="{c1}"/></linearGradient>' for n, (y0, y1, c0, c1) in GRADS.items()) \
    + '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6ff0dc"/><stop offset="1" stop-color="#0f9d90"/></linearGradient></defs>'
CHAR = "".join(svg_part(p) for p in SHADOW + BODY)
SPARKLES = '<g fill="#ffffff"><path d="M96 92l6 16 16 6-16 6-6 16-6-16-16-6 16-6z" opacity=".95"/><path d="M424 96l4.5 12 12 4.5-12 4.5-4.5 12-4.5-12-12-4.5 12-4.5z" opacity=".85"/><path d="M78 432l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" opacity=".8"/></g>'
open("brand/pager-character.svg", "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="66 90 380 380">{DEFS}{CHAR}</svg>\n')
tile = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{DEFS}<rect width="512" height="512" rx="116" fill="url(#bg)"/>{SPARKLES}<g fill="none">' \
       + "".join(svg_part(p) for p in WAVES) + f'</g><g transform="translate(0,-24)">{CHAR}' + "".join(svg_part(p) for p in RING) + '</g></svg>\n'
open("brand/pager-mascot.svg", "w").write(tile)
shutil.copyfile("brand/pager-mascot.svg", "app/public/icon.svg")

# ---- Android ------------------------------------------------------------------------------------------------------------
def avd(p):
    a = [f'android:pathData="{p["d"]}"']
    if p["fill"] and not p["grad"]: a.append(f'android:fillColor="{p["fill"]}"')
    if p["stroke"]: a += [f'android:strokeColor="{p["stroke"]}"', f'android:strokeWidth="{p["sw"]}"', 'android:strokeLineCap="round"', 'android:strokeLineJoin="round"']
    if p["alpha"] is not None: a.append(f'android:strokeAlpha="{p["alpha"]}"')
    if p["falpha"] is not None: a.append(f'android:fillAlpha="{p["falpha"]}"')
    if p["grad"]:
        y0, y1, c0, c1 = GRADS[p["grad"]]
        inner = (f'<aapt:attr name="android:fillColor"><gradient android:type="linear" android:startX="256" android:endX="256" '
                 f'android:startY="{y0}" android:endY="{y1}" android:startColor="{c0}" android:endColor="{c1}"/></aapt:attr>')
        return f'<path {" ".join(a)}>{inner}</path>'
    return f'<path {" ".join(a)}/>'

def vector(parts, name, size_dp, viewport, group=None):
    body = "\n    ".join(parts)
    if group: body = f'<group android:scaleX="{group[0]}" android:scaleY="{group[0]}" android:translateX="{group[1]}" android:translateY="{group[2]}">\n    {body}\n    </group>'
    open(f"{RES}/drawable/{name}.xml", "w").write(f'<?xml version="1.0" encoding="utf-8"?>\n<vector {NS} android:width="{size_dp}dp" android:height="{size_dp}dp" android:viewportWidth="{viewport}" android:viewportHeight="{viewport}">\n    {body}\n</vector>\n')

for name, parts in [("pager_body", BODY), ("pager_waves", WAVES), ("pager_ring", RING), ("pager_shadow", SHADOW)]:
    vector([avd(p) for p in parts], name, 512, 512)

S = 0.17  # the pager fits the 72dp safe zone of a 108dp adaptive icon
tx, ty = round(54 - 256 * S, 2), round(54 - 280 * S, 2)
vector([avd(p) for p in SHADOW + BODY], "ic_foreground", 108, 108, group=(S, tx, ty))

def silhouette(scale, tx, ty, size, name):
    c = "#000000" if size > 24 else "#FFFFFF"
    parts = [
        f'<path android:fillColor="{c}" android:fillType="evenOdd" android:pathData="{rect(76, 150, 360, 232, 56)} {rect(112, 184, 230, 106, 14)}"/>',
        f'<path android:fillColor="{c}" android:pathData="{ellipse(190, 396, 30, 15)} {ellipse(322, 396, 30, 15)} M211,246 Q227,276 243,246 Z"/>',
        f'<path android:strokeColor="{c}" android:strokeWidth="13" android:strokeLineCap="round" android:pathData="M168,234 Q185,206 202,234 M252,234 Q269,206 286,234"/>',
    ]
    vector(parts, name, size, size, group=(scale, tx, ty))
vector_size = 108
silhouette(S, tx, ty, 108, "ic_monochrome")
N = 0.056
silhouette(N, round(12 - 256 * N, 2), round(12 - 280 * N, 2), 24, "ic_notif")

open(f"{RES}/drawable/ic_background.xml", "w").write('''<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <gradient android:angle="315" android:startColor="#6FF0DC" android:endColor="#0F9D90"/>
</shape>
''')
print("brand written")
