#!/usr/bin/env python3
"""Generates the Android vector drawables for the Pager mascot from the same geometry as pager-mascot.svg.
Run from the repo root:  python3 brand/make-android-vectors.py"""
import os

RES = "android/app/src/main/res"
INK = "#0e6b63"
NS = 'xmlns:android="http://schemas.android.com/apk/res/android" xmlns:aapt="http://schemas.android.com/aapt"'

def rect(x, y, w, h, r):
    return f"M{x+r},{y} H{x+w-r} A{r},{r} 0 0 1 {x+w},{y+r} V{y+h-r} A{r},{r} 0 0 1 {x+w-r},{y+h} H{x+r} A{r},{r} 0 0 1 {x},{y+h-r} V{y+r} A{r},{r} 0 0 1 {x+r},{y} Z"

def ellipse(cx, cy, rx, ry):
    return f"M{cx-rx},{cy} A{rx},{ry} 0 1 0 {cx+rx},{cy} A{rx},{ry} 0 1 0 {cx-rx},{cy} Z"

def path(d, fill=None, stroke=None, sw=None, alpha=None, falpha=None, grad=None):
    a = [f'android:pathData="{d}"']
    if fill and not grad: a.append(f'android:fillColor="{fill}"')
    if stroke: a += [f'android:strokeColor="{stroke}"', f'android:strokeWidth="{sw}"', 'android:strokeLineCap="round"', 'android:strokeLineJoin="round"']
    if alpha is not None: a.append(f'android:strokeAlpha="{alpha}"')
    if falpha is not None: a.append(f'android:fillAlpha="{falpha}"')
    if grad:
        y0, y1, c0, c1 = grad
        inner = (f'<aapt:attr name="android:fillColor"><gradient android:type="linear" android:startX="256" android:endX="256" '
                 f'android:startY="{y0}" android:endY="{y1}" android:startColor="{c0}" android:endColor="{c1}"/></aapt:attr>')
        return f'<path {" ".join(a)}>{inner}</path>'
    return f'<path {" ".join(a)}/>'

BODY = [
    path(ellipse(210, 408, 28, 15), fill="#FFFFFF", stroke=INK, sw=8),
    path(ellipse(302, 408, 28, 15), fill="#FFFFFF", stroke=INK, sw=8),
    path("M150,262 Q124,256 120,228", stroke=INK, sw=22), path("M150,262 Q124,256 120,228", stroke="#FFFFFF", sw=10),
    path(ellipse(118, 222, 19, 19), fill="#FFFFFF", stroke=INK, sw=8),
    path("M362,262 Q388,256 392,228", stroke=INK, sw=22), path("M362,262 Q388,256 392,228", stroke="#FFFFFF", sw=10),
    path(ellipse(394, 222, 19, 19), fill="#FFFFFF", stroke=INK, sw=8),
    path(rect(146, 116, 220, 284, 64), fill="#FFFFFF", stroke=INK, sw=10, grad=(116, 400, "#FFFFFF", "#C9F4EC")),
    path(rect(174, 148, 164, 136, 36), fill="#FFFFFF", stroke=INK, sw=8, grad=(148, 284, "#14706A", "#0A3A37")),
    path("M196,170 Q216,160 240,162", stroke="#7FF5E3", sw=7, alpha=0.35),
    path("M204,216 Q221,188 238,216", stroke="#8FF7E6", sw=12), path("M274,216 Q291,188 308,216", stroke="#8FF7E6", sw=12),
    path(ellipse(196, 240, 15, 9), fill="#FF7B9C", falpha=0.75), path(ellipse(316, 240, 15, 9), fill="#FF7B9C", falpha=0.75),
    path("M236,236 Q256,274 276,236 Z", fill="#8A1236", stroke="#8A1236", sw=5),
    path(ellipse(256, 253, 9, 5.5), fill="#FF9DB3"),
    path(ellipse(208, 338, 15, 15), fill="#FF6F8E", stroke=INK, sw=7), path(ellipse(256, 338, 15, 15), fill="#FFC83D", stroke=INK, sw=7), path(ellipse(304, 338, 15, 15), fill="#2DD4BF", stroke=INK, sw=7),
    path("M180,372 H332", stroke=INK, sw=7, alpha=0.35),
]
ANTENNA = [path("M256,120 V86", stroke=INK, sw=10), path(ellipse(256, 72, 16, 16), fill="#FF6F8E", stroke=INK, sw=8), path(ellipse(251, 67, 4.5, 4.5), fill="#FFFFFF", falpha=0.9)]
WAVES = [path("M92,198 Q62,256 92,314", stroke="#D5FBF4", sw=14), path("M420,198 Q450,256 420,314", stroke="#D5FBF4", sw=14),
         path("M62,172 Q18,256 62,340", stroke="#D5FBF4", sw=14, alpha=0.65), path("M450,172 Q494,256 450,340", stroke="#D5FBF4", sw=14, alpha=0.65)]
RING = [path("M300,60 l16,-16", stroke="#FFFFFF", sw=9), path("M322,80 l22,-6", stroke="#FFFFFF", sw=9), path("M212,60 l-16,-16", stroke="#FFFFFF", sw=9), path("M190,80 l-22,-6", stroke="#FFFFFF", sw=9)]
SHADOW = [path(ellipse(256, 436, 96, 12), fill="#0B4F49", falpha=0.28)]

def vector(parts, name, size_dp=108, viewport=512, group=None):
    body = "\n    ".join(parts)
    if group:
        body = f'<group android:scaleX="{group[0]}" android:scaleY="{group[0]}" android:translateX="{group[1]}" android:translateY="{group[2]}">\n    {body}\n    </group>'
    xml = f'<?xml version="1.0" encoding="utf-8"?>\n<vector {NS} android:width="{size_dp}dp" android:height="{size_dp}dp" android:viewportWidth="{viewport}" android:viewportHeight="{viewport}">\n    {body}\n</vector>\n'
    open(f"{RES}/drawable/{name}.xml", "w").write(xml)

# In-app mascot, one vector per animated part (all share the 512 viewport so they stack exactly).
for name, parts in [("pager_body", BODY), ("pager_antenna", ANTENNA), ("pager_waves", WAVES), ("pager_ring", RING), ("pager_shadow", SHADOW)]:
    vector(parts, name, size_dp=512)

# Launcher icon: the character (without waves), scaled into the 72dp safe zone of a 108dp adaptive icon.
S = 0.17
vector(SHADOW + BODY + ANTENNA, "ic_foreground", 108, 108, group=(S * 108 / 108 * 1.0, 54 - 256 * S, 56 - 250 * S)) if False else None
fg = SHADOW + BODY + ANTENNA
xml = f'<?xml version="1.0" encoding="utf-8"?>\n<vector {NS} android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">\n    <group android:scaleX="{S}" android:scaleY="{S}" android:translateX="{54 - 256*S:.2f}" android:translateY="{56 - 250*S:.2f}">\n    ' + "\n    ".join(fg) + "\n    </group>\n</vector>\n"
open(f"{RES}/drawable/ic_foreground.xml", "w").write(xml)

# Themed (monochrome) launcher icon + notification icon: a flat silhouette the system can tint.
def silhouette(scale, tx, ty, w, h, vp, name, color):
    body = rect(146, 116, 220, 284, 64) + " " + rect(176, 150, 160, 132, 34)  # screen punched out with even-odd
    parts = [
        f'<path android:fillColor="{color}" android:fillType="evenOdd" android:pathData="{body}"/>',
        f'<path android:fillColor="{color}" android:pathData="{ellipse(210, 408, 28, 15)} {ellipse(302, 408, 28, 15)} {ellipse(256, 72, 16, 16)} {ellipse(118, 222, 19, 19)} {ellipse(394, 222, 19, 19)}"/>',
        f'<path android:strokeColor="{color}" android:strokeWidth="12" android:strokeLineCap="round" android:pathData="M256,116 V88 M150,262 Q124,256 120,228 M362,262 Q388,256 392,228"/>',
        f'<path android:strokeColor="{color}" android:strokeWidth="14" android:strokeLineCap="round" android:pathData="M204,216 Q221,188 238,216 M274,216 Q291,188 308,216"/>',
        f'<path android:fillColor="{color}" android:pathData="M236,236 Q256,274 276,236 Z"/>',
        f'<path android:fillColor="{color}" android:pathData="{ellipse(208, 338, 15, 15)} {ellipse(256, 338, 15, 15)} {ellipse(304, 338, 15, 15)}"/>',
    ]
    x = f'<?xml version="1.0" encoding="utf-8"?>\n<vector {NS} android:width="{w}dp" android:height="{h}dp" android:viewportWidth="{vp}" android:viewportHeight="{vp}">\n    <group android:scaleX="{scale}" android:scaleY="{scale}" android:translateX="{tx}" android:translateY="{ty}">\n    ' + "\n    ".join(parts) + "\n    </group>\n</vector>\n"
    open(f"{RES}/drawable/{name}.xml", "w").write(x)

silhouette(S, round(54 - 256 * S, 2), round(56 - 250 * S, 2), 108, 108, 108, "ic_monochrome", "#000000")
silhouette(0.052, round(12 - 256 * 0.052, 2), round(12.3 - 250 * 0.052, 2), 24, 24, 24, "ic_notif", "#FFFFFF")

# Launcher background: the teal gradient.
open(f"{RES}/drawable/ic_background.xml", "w").write('''<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <gradient android:angle="315" android:startColor="#6FF0DC" android:endColor="#0F9D90"/>
</shape>
''')
open(f"{RES}/mipmap-anydpi-v26/ic_launcher.xml", "w").write('''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_background" />
    <foreground android:drawable="@drawable/ic_foreground" />
    <monochrome android:drawable="@drawable/ic_monochrome" />
</adaptive-icon>
''')
print("ok")
