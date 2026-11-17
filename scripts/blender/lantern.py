"""
Builds the stone lantern that stands on the river's banks (components/RiverBackground.tsx) and exports it to
public/models/lantern/lantern.glb.

Run from the project folder:
    blender -b --factory-startup -P scripts/blender/lantern.py -- [--preview out.png] [--blend out.blend]

A hexagonal kasuga-style lantern: a base carved with lotus petals, a pillar with a ring round its middle, a
platform, the light box (round moon windows on three sides, open on the others), a roof whose corners
curl up, and a jewel on a lotus seat, with moss on the tops. The light box is hollow round the glowing
paper box the scene adds at height 0.78 (0.14 square, 0.17 tall). Units as the old built-in lantern,
which the scene scales by 1.25. See common.py for what the file carries.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa: F401,F403

OUT = arg("--out", os.path.join(ROOT, "public", "models", "lantern", "lantern.glb"))
STONE, STONE_DARK, MOSS = "#8d8a80", "#7a776e", "#6b7858"

# ---- base, pillar, platform
part(STONE_DARK, over=MOSS, name="plinth")(lambda bm: lathe(bm, [(0.25, 0.0), (0.25, 0.055), (0.22, 0.065)], hexagon(2)))
part(STONE, over=MOSS, name="lotus")(lambda bm: lathe(bm, [(0.2, 0.055), (0.19, 0.09), (0.15, 0.115), (0.09, 0.125)], petals(48, 6, 0.1)))
part(STONE, name="pillar")(lambda bm: lathe(
    bm, [(0.08, 0.12), (0.075, 0.3), (0.085, 0.31), (0.085, 0.345), (0.075, 0.355), (0.068, 0.59)], circle(12)))
part(STONE, over=MOSS, name="platform")(lambda bm: lathe(
    bm, [(0.1, 0.585), (0.15, 0.61), (0.2, 0.635), (0.2, 0.67), (0.18, 0.69)], hexagon(2)))

# ---- the light box: posts at the corners, a sill and a lintel, moon-window panels on alternate sides
BOX_R, Z0, Z1 = 0.14, 0.715, 0.855
part(STONE, name="sill")(lambda bm: lathe(bm, [(0.09, 0.69), (0.17, 0.69), (0.17, Z0), (0.09, Z0)], hexagon(1), loop=True))
part(STONE, name="lintel")(lambda bm: lathe(bm, [(0.09, Z1), (0.17, Z1), (0.17, 0.88), (0.09, 0.88)], hexagon(1), loop=True))

@part(STONE, name="posts")
def _(bm):
    for k in range(6):
        c = corner(k, BOX_R)
        beam(bm, (c.x, c.y, Z0), (c.x, c.y, Z1), 0.035, 0.035)

def moon_panel(bm, c0, c1, hole, thick=0.02, n=20):
    """A stone panel between two posts with a round window through it."""
    e = (c1 - c0).normalized()
    nrm = Vector((e.y, -e.x, 0))
    mid = (c0 + c1) / 2 + Vector((0, 0, (Z0 + Z1) / 2))
    hw, hh = (c1 - c0).length / 2, (Z1 - Z0) / 2
    faces = []
    for side in (1, -1):
        outer, inner = [], []
        for k in range(n):
            a = 2 * math.pi * k / n
            ca, sa = math.cos(a), math.sin(a)
            s = min(hw / abs(ca) if abs(ca) > 1e-6 else 9, hh / abs(sa) if abs(sa) > 1e-6 else 9)
            base = mid + nrm * (side * thick / 2)
            outer.append(bm.verts.new(base + e * (ca * s) + Vector((0, 0, sa * s))))
            inner.append(bm.verts.new(base + e * (ca * hole) + Vector((0, 0, sa * hole))))
        faces.append((outer, inner))
    (o1, i1), (o2, i2) = faces
    for k in range(n):
        k2 = (k + 1) % n
        bm.faces.new((o1[k], o1[k2], i1[k2], i1[k]))
        bm.faces.new((o2[k], i2[k], i2[k2], o2[k2]))
        bm.faces.new((o1[k], o2[k], o2[k2], o1[k2]))  # the panel's edge
        bm.faces.new((i1[k], i1[k2], i2[k2], i2[k]))  # round the window

@part(STONE, name="panels")
def _(bm):
    for k in (1, 3, 5):
        c0, c1 = corner(k, BOX_R), corner(k + 1, BOX_R)
        e = (c1 - c0).normalized()
        moon_panel(bm, c0 + e * 0.0175, c1 - e * 0.0175, 0.045)

# ---- the roof, its corners curling up, and the jewel on its lotus seat
KASA = dict(z_top=1.0, r_top=0.05, z_eave=0.9, r_eave=0.29, lift=0.025, out=0.05, curve=1.6, thick=0.05)
part(STONE, over=MOSS, name="roof")(lambda bm: roof_surface(bm, KASA, 8, 5))

@part(STONE, name="ridges")
def _(bm):  # a ridge down each hip, ending in a rounded curl (warabite)
    for s in range(6):
        pts = [roof_point(KASA, s, 0, j / 6) + Vector((0, 0, 0.01)) for j in range(7)]
        tube(bm, pts, 0.014, 0.017)
        tip = pts[-1]
        lathe(bm, [(0.0, -0.012), (0.02, 0.0), (0.026, 0.02), (0.02, 0.04), (0.0, 0.048)], circle(8), at=(tip.x, tip.y, tip.z))

part(STONE, name="seat")(lambda bm: lathe(bm, [(0.045, 0.985), (0.07, 1.02), (0.06, 1.035), (0.035, 1.04)], petals(30, 5, 0.12)))
part(STONE, name="jewel")(lambda bm: lathe(
    bm, [(0.03, 1.04), (0.055, 1.065), (0.052, 1.095), (0.03, 1.125), (0.01, 1.15), (0.0, 1.16)], circle(12)))

finish(OUT, ao_distance=0.12, ground_z=0.0, ao_floor=0.45, lens=60,
       views=[((1.7, -2.5, 1.1), (0, 0, 0.55)), ((0.5, -1.6, 0.85), (0, 0, 0.8))])
