"""
Builds the red arched bridge (taiko-bashi) across the river scene's stream (components/RiverBackground.tsx)
and exports it to public/models/bridge/bridge.glb.

Run from the project folder:
    blender -b --factory-startup -P scripts/blender/bridge.py -- [--preview out.png] [--blend out.blend]

The arch is the old built-in bridge's: SPAN 9.4 along x, rising 0.95 above the banks (0.42), the deck 0.62
either side of the middle. Like a Japanese garden bridge it carries itself, with no piers in the water: a deep
vermilion arch beam each side with a moulding along its top, weathered planks across, and a balustrade of a low
rail, a middle rail and a round top rail, with short balusters in both bands. Chinese lotus heads (a red petalled
seat holding a golden pearl) crown the posts, larger on the end and middle ones, and the ends rest on stone
footings. See common.py for what the file carries.
"""
import os, sys, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa: F401,F403

OUT = arg("--out", os.path.join(ROOT, "public", "models", "bridge", "bridge.glb"))
VERMILION, VERMILION_DARK, UNDERSIDE, BRONZE = "#b8342a", "#9a2a22", "#3a2420", "#a8873e"
PLANKS = ["#6e4a33", "#664430", "#76503a"]
STONES, MOSS = ["#7d786f", "#8a857b", "#6f6b63"], "#66735a"

SPAN, RISE, WIDE, BANK = 9.4, 0.95, 0.62, 0.42
deck = lambda x: BANK + RISE * (1 - (2 * x / SPAN) ** 2) - 0.05  # the deck's top
SEGS = 44
xs = [-SPAN / 2 + SPAN * i / SEGS for i in range(SEGS + 1)]
along = lambda y, h=0.0: [Vector((x, y, deck(x) + h)) for x in xs]  # a line along the arch, h above the deck
rng = random.Random(7)

# ---- the deck: planks across, a hair apart, each a little off level and a shade different
N, GAP = 72, 0.014
groups = [[] for _ in PLANKS]
for i in range(N):
    x0 = -SPAN / 2 + SPAN * i / N + GAP / 2
    x1 = x0 + SPAN / N - GAP
    groups[rng.randrange(len(PLANKS))].append((x0, x1, (rng.random() - 0.5) * 0.008))
for tone, planks in zip(PLANKS, groups):
    @part(tone, wood=((0, 1, 0), 1.0), name="planks")
    def _(bm, planks=planks):
        for x0, x1, j in planks:
            beam(bm, (x0, 0, deck(x0) - 0.025 + j), (x1, 0, deck(x1) - 0.025 + j), 2 * WIDE + 0.02, 0.05)

# the deck's underside between the arch beams, in shadow
part(UNDERSIDE, name="soffit")(lambda bm: sweep(bm, along(0), rect(2 * WIDE - 0.05, 0.03, -0.09)))

# ---- the arch beams that carry it, deep enough to span the stream alone, with a moulding along the top
for y in (WIDE, -WIDE):
    part(VERMILION, name="arch")(lambda bm, y=y: sweep(bm, along(y), rect(0.09, 0.3, -0.34), wood=0.55))
    out = 1 if y > 0 else -1
    part(VERMILION_DARK, name="moulding")(lambda bm, y=y, out=out: sweep(bm, along(y + out * 0.012), rect(0.11, 0.035, -0.075), wood=0.55))

# ---- balustrades: low rail on the planks, a middle rail, a round top rail; short balusters in both bands
POSTS = 11  # an odd number, so one stands mid-span
post_x = [-SPAN / 2 + SPAN * k / (POSTS - 1) for k in range(POSTS)]

def lotus_head(x, y, top, s):
    """A Chinese post head: a red lacquered lotus seat of upturned petals holding a round golden pearl."""
    part(VERMILION, name="lotus")(lambda bm: lathe(
        bm, [(0.045 * s, 0.0), (0.05 * s, 0.012 * s), (0.04 * s, 0.022 * s), (0.055 * s, 0.045 * s), (0.068 * s, 0.07 * s),
             (0.05 * s, 0.072 * s)], petals(16, 8, 0.15), at=(x, y, top)))
    part(BRONZE, name="pearl")(lambda bm: lathe(
        bm, [(0.0, 0.055 * s), (0.032 * s, 0.062 * s), (0.046 * s, 0.085 * s), (0.044 * s, 0.11 * s), (0.03 * s, 0.13 * s),
             (0.012 * s, 0.14 * s), (0.0, 0.142 * s)], circle(8), at=(x, y, top)))

for y in (WIDE, -WIDE):
    @part(VERMILION, name="rails")
    def _(bm, y=y):
        sweep(bm, along(y), rect(0.05, 0.05, 0.0), wood=0.55)  # low rail
        sweep(bm, along(y), rect(0.035, 0.03, 0.2), wood=0.55)  # middle rail
        sweep(bm, along(y, 0.43), [(0.03 * math.cos(a), 0.03 * math.sin(a)) for a in (k * math.pi / 4 for k in range(8))], wood=0.55)

    for k, x in enumerate(post_x):
        main = k in (0, POSTS // 2, POSTS - 1)  # the end posts and the middle one stand taller
        top = deck(x) + (0.56 if main else 0.47)
        part(VERMILION, wood=((0, 0, 1), 0.55), name="post")(lambda bm, x=x, y=y, top=top, main=main: beam(
            bm, (x, y, deck(x) - 0.06), (x, y, top), 0.085 if main else 0.07, 0.085 if main else 0.07))
        lotus_head(x, y, top, 1.0 if main else 0.75)

    @part(VERMILION, wood=((0, 0, 1), 0.55), name="balusters")
    def _(bm, y=y):
        for x0, x1 in zip(post_x, post_x[1:]):
            for f in (0.2, 0.4, 0.6, 0.8):  # lower band
                bx = x0 + (x1 - x0) * f
                beam(bm, (bx, y, deck(bx) + 0.05), (bx, y, deck(bx) + 0.2), 0.022, 0.022)
            for f in (1 / 3, 2 / 3):  # upper band
                bx = x0 + (x1 - x0) * f
                beam(bm, (bx, y, deck(bx) + 0.23), (bx, y, deck(bx) + 0.41), 0.025, 0.025)

# ---- stone footings where the arch meets the banks: courses of roughly squared blocks
for s in (-1, 1):
    end = deck(s * SPAN / 2)
    courses = [(-0.75, -0.35), (-0.35, 0.0), (0.0, end - 0.04)]
    for c, (z0, z1) in enumerate(courses):
        ys = [-0.8, -0.27, 0.27, 0.8] if c % 2 == 0 else [-0.8, 0.0, 0.8]
        for y0, y1 in zip(ys, ys[1:]):
            tone = STONES[rng.randrange(len(STONES))]
            inset = rng.random() * 0.03
            part(tone, over=MOSS, name="footing")(lambda bm, s=s, z0=z0, z1=z1, y0=y0, y1=y1, inset=inset: beam(
                bm, (s * (4.42 + inset), (y0 + y1) / 2 + 0.005, (z0 + z1) / 2), (s * 5.05, (y0 + y1) / 2 + 0.005, (z0 + z1) / 2),
                y1 - y0 - 0.02, z1 - z0 - 0.015))

finish(OUT, ao_distance=0.25, ao_floor=0.4, lens=35,
       views=[((0, -7.0, 2.3), (0, 3.5, -0.7)), ((5.5, -5.5, 2.6), (0, 0, 0.7)), ((-4.15, -1.45, 1.1), (-4.7, -0.62, 0.98))])
