"""
Builds the red pavilion that stands upstream in the river scene (components/RiverBackground.tsx) and
exports it to public/models/pavilion/pavilion.glb.

Run from the project folder:
    blender -b --factory-startup -P scripts/blender/pavilion.py -- [--preview out.png] [--blend out.blend]

A Chinese double-eaved hexagonal pavilion: a stone plinth with steps at the front, six red columns on stone
bases, benches with leaning backrests on five sides, painted beams and brackets, a tiled lower roof with
upturned corners, a small latticed upper storey, a steeper upper roof and a bronze finial. Units match the
old built-in pavilion: plinth top at z 0.2, columns on a hexagon of radius 0.9. See common.py for what the
file carries.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa: F401,F403  (bpy, bmesh, math, Vector and the helpers)

OUT = arg("--out", os.path.join(ROOT, "public", "models", "pavilion", "pavilion.glb"))

# ---- colours (the scene's: RED and ROOF as before, the bridge's bronze, the lanterns' stone)
RED, RED_DARK, RAFTER = "#9e2b24", "#7e221d", "#4f2620"
ROOF, RIDGE = "#3f3d3b", "#5a5752"
STONE, STONE_LIGHT, STONE_DARK = "#8a857c", "#9a958b", "#76726a"
TEAL, BRONZE, SHADOW = "#2f5f5a", "#a8873e", "#3b2b25"

def roof(R):
    part(ROOF, under=RAFTER, name="roof")(lambda bm: roof_surface(bm, R, R["tiles"] * 3, R["rows"]))

    @part(RIDGE, name="hips")
    def _(bm):  # a raised ridge down each hip, curling up at the tip
        for s in range(6):
            pts = [roof_point(R, s, 0, j / 10) + Vector((0, 0, 0.035)) for j in range(11)]
            tip, out = pts[-1], (pts[-1] - pts[-2]).normalized()
            pts.append(tip + out * 0.05 + Vector((0, 0, 0.06)))
            tube(bm, pts, 0.04, 0.028)

# ---- plinth, floor and steps
STONE_RING = hexagon(3)
part(STONE_DARK, name="plinth_low")(lambda bm: lathe(bm, [(1.46, -0.42), (1.46, -0.06), (1.40, -0.03)], STONE_RING))
part(STONE, name="plinth")(lambda bm: lathe(bm, [(1.30, -0.03), (1.30, 0.15), (1.35, 0.16), (1.35, 0.2)], STONE_RING))
part(STONE_LIGHT, closed=False, name="floor")(lambda bm: lathe(
    bm, [(1.34, 0.202), (1.1, 0.202), (1.0, 0.202), (0.9, 0.202), (0.8, 0.202), (0.55, 0.202), (0.3, 0.202), (0, 0.202)],
    hexagon(2), caps=False))

@part(STONE_DARK, name="steps")
def _(bm):  # three steps down from the front edge (the face looking along -y)
    for i, top in enumerate([0.05, -0.1, -0.25]):
        y0, y1 = -1.1 - 0.17 * i, -1.1 - 0.17 * (i + 1)
        beam(bm, (-0.42, (y0 + y1) / 2, (top - 0.45) / 2), (0.42, (y0 + y1) / 2, (top - 0.45) / 2), abs(y1 - y0), top + 0.45)

# ---- columns on stone bases, joined at the top by a plate
COL_R = 0.9
for k in range(6):
    c = corner(k, COL_R)
    part(STONE, name="base")(lambda bm, c=c: lathe(bm, [(0.11, 0.2), (0.125, 0.22), (0.1, 0.27), (0.078, 0.29)], circle(10), at=c))
    part(RED, wood=((0, 0, 1), 0.55), name="column")(lambda bm, c=c: lathe(bm, [(0.068, 0.25), (0.06, 1.64)], circle(10), at=c))

part(RED, wood=((1, 0, 0), 0.45), name="plate")(lambda bm: lathe(bm, [(0.84, 1.62), (0.98, 1.62), (0.98, 1.69), (0.84, 1.69)], hexagon(2), loop=True))

FRONT = 4  # the edge from corner 4 to 5 faces -y, where the steps are: no bench there
lvl = lambda p, z: Vector((p.x, p.y, z))
for k in range(6):
    c0, c1 = corner(k, COL_R), corner(k + 1, COL_R)
    along = (c1 - c0).normalized()
    outward = ((c0 + c1) / 2).normalized()

    @part(RED, wood=(tuple(along), 0.45), name="beams")
    def _(bm, c0=c0, c1=c1):  # an architrave, and below it struts down to a narrower beam
        beam(bm, lvl(c0, 1.555), lvl(c1, 1.555), 0.09, 0.12)
        for f in (0.2, 0.4, 0.6, 0.8):
            p = c0.lerp(c1, f)
            beam(bm, lvl(p, 1.43), lvl(p, 1.495), 0.025, 0.025)

    part(TEAL, name="band")(lambda bm, c0=c0, c1=c1: beam(bm, lvl(c0, 1.40), lvl(c1, 1.40), 0.07, 0.06))

    if k != FRONT:  # a bench between the columns with a backrest leaning out over the edge
        p0, p1 = c0 + along * 0.08, c1 - along * 0.08

        @part(RED, wood=(tuple(along), 0.5), name="bench")
        def _(bm, p0=p0, p1=p1, outward=outward):
            beam(bm, lvl(p0, 0.44), lvl(p1, 0.44), 0.2, 0.04)  # seat
            top0, top1 = p0 + outward * 0.13, p1 + outward * 0.13
            beam(bm, lvl(top0, 0.74), lvl(top1, 0.74), 0.045, 0.04)  # rail
            for i in range(9):
                f = (i + 0.5) / 9
                beam(bm, lvl(p0.lerp(p1, f) + outward * 0.07, 0.46), lvl(top0.lerp(top1, f), 0.725), 0.025, 0.02)
        part(RED_DARK, name="apron")(lambda bm, p0=p0, p1=p1: beam(bm, lvl(p0, 0.315), lvl(p1, 0.315), 0.03, 0.22))

# brackets: a block on each column and an arm reaching out to carry the eave's corner
for k in range(6):
    d = corner(k)

    @part(RED, wood=(tuple(d), 0.45), name="bracket")
    def _(bm, d=d):
        beam(bm, d * 0.86 + Vector((0, 0, 1.73)), d * 0.98 + Vector((0, 0, 1.73)), 0.15, 0.08)
        beam(bm, d * 0.8 + Vector((0, 0, 1.8)), d * 1.22 + Vector((0, 0, 1.8)), 0.06, 0.06)

# ---- lower roof, then the small upper storey standing out of it
roof(dict(z_top=2.15, r_top=0.78, z_eave=1.74, r_eave=1.55, lift=0.22, out=0.06, tiles=9, rows=7, thick=0.04))
part(RIDGE, name="collar")(lambda bm: lathe(bm, [(0.6, 2.1), (0.86, 2.1), (0.86, 2.2), (0.6, 2.2)], hexagon(2), loop=True))

part(SHADOW, name="storey")(lambda bm: lathe(bm, [(0.64, 2.0), (0.64, 2.5)], hexagon(1)))
for k in range(6):
    c = corner(k, 0.665)
    part(RED, wood=((0, 0, 1), 0.55), name="post")(lambda bm, c=c: lathe(bm, [(0.045, 2.0), (0.045, 2.5)], circle(8), at=c))
    c0, c1 = corner(k, 0.655), corner(k + 1, 0.655)

    @part(RED, name="lattice")
    def _(bm, c0=c0, c1=c1):
        for z in (2.14, 2.27, 2.40):
            beam(bm, lvl(c0, z), lvl(c1, z), 0.02, 0.02)
        for f in (0.25, 0.5, 0.75):
            p = c0.lerp(c1, f)
            beam(bm, lvl(p, 2.08), lvl(p, 2.47), 0.02, 0.02)
part(RED, wood=((1, 0, 0), 0.45), name="lintel")(lambda bm: lathe(bm, [(0.6, 2.44), (0.74, 2.44), (0.74, 2.53), (0.6, 2.53)], hexagon(2), loop=True))

roof(dict(z_top=3.3, r_top=0.06, z_eave=2.5, r_eave=1.12, lift=0.2, out=0.06, tiles=7, rows=8, thick=0.035))
part(BRONZE, name="finial")(lambda bm: lathe(
    bm, [(0.13, 3.2), (0.15, 3.25), (0.08, 3.32), (0.12, 3.42), (0.1, 3.52), (0.04, 3.58), (0.065, 3.66), (0.0, 3.84)], circle(10)))

finish(OUT, ao_distance=0.6, ground_z=-0.4,
       views=[((5.2, -7.5, 3.6), (0, 0, 1.55)), ((2.5, -9.5, 0.9), (0, 0, 1.7))])
