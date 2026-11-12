"""
Builds the lettuce heads that fill the Rustbreeder farm's trays (components/FarmBackground.tsx) and exports them
to public/models/lettuce/lettuce.glb.

Run from the project folder:
    blender -b --factory-startup -P scripts/blender/lettuce.py -- [--preview out.png] [--blend out.blend]

One head for each of the farm's eight varieties (butterheads, frilly loose leaf, upright romaine, young heads),
each at two levels of detail: v<k>_hi for the nearest trays and v<k>_lo for the rest. The farm lays them out six
or eight to a tray, turned, sized and mirrored at random, so a handful of heads covers the whole aisle.

Every leaf is a bent, cupped, ruffled sheet: its midrib rises from the head's centre and arcs out (outer
leaves flop onto the tray, the heart curls inward), its sides cup up round the midrib, and its edge waves
(gently on a butterhead, in tight frills on loose leaf). Colour is painted per vertex: a pale stem end and
midrib, darker edges, and yellower leaves toward the heart, darkened by ambient occlusion baked in Blender
(the tray included). The leaves are single sheets, so the farm draws them double-sided.
Blender is z-up with the tray surface at z = 0; the export turns it y-up.
"""
import bpy, bmesh, math, os, sys, colorsys, random
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = arg("--out", os.path.join(ROOT, "public", "models", "lettuce", "lettuce.glb"))
PREVIEW, BLEND = arg("--preview"), arg("--blend")

# [kind, base hue, saturation, lightness shift], kind 0: butterhead, 1: loose leaf, 2: romaine, 3: young heads.
# The farm picks among these by index, and lays young heads out eight to a tray instead of six.
VARIETIES = [(0, 92, 60, 4), (1, 84, 66, 10), (0, 104, 52, -6), (2, 98, 56, 0),
             (0, 80, 68, 12), (3, 96, 58, 6), (1, 112, 44, -8), (2, 88, 62, 4)]
RADIUS = {0: 0.22, 1: 0.22, 2: 0.19, 3: 0.15}  # leaf reach, metres; a tray is 1.3 x 0.78
# per level of detail: points along each leaf, and across it (denser near the midrib for its pale stripe)
LODS = {"hi": (12, [-1, -0.6, -0.28, -0.1, 0, 0.1, 0.28, 0.6, 1]), "lo": (6, [-1, -0.45, 0, 0.45, 1])}
RES = LODS["hi"]

def to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def hsl(h, s, l):  # css-style hsl (degrees, percent, percent) to linear rgba
    s *= 0.72  # lit, the colour comes out brighter than the canvas's old flat fills, so saturation is toned down
    r, g, b = colorsys.hls_to_rgb((h % 360) / 360, max(0, min(100, l)) / 100, max(0, min(100, s)) / 100)
    return (to_lin(r), to_lin(g), to_lin(b), 1.0)

def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

def mixc(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(4))

def leaf(bm, col, rnd, c, phi, el, L, Wd, curl, cup, ruffle, freq, twist, hsl0, shape, crinkle):
    """One leaf of a head centred at c. phi: which way round the head it points; el: how steeply it leaves the
    centre; curl: how much the midrib bends down (outward flop) along its length, negative to curl in over the
    heart; cup: how much its sides lift round the midrib; ruffle/freq: the waves along its edge; shape: how
    far up the leaf it's widest (low: round, high: long and strappy)."""
    h, s, l = hsl0
    US, VS = RES
    d = Vector((math.cos(phi), math.sin(phi), 0))
    side = Vector((-math.sin(phi), math.cos(phi), 0))
    up = Vector((0, 0, 1))
    ph1, ph2 = rnd.random() * 6.3, rnd.random() * 6.3
    # midrib, integrated in the vertical plane through the centre
    pts, frames = [], []
    p = c + d * (0.006 + rnd.random() * 0.01) + up * (0.004 + rnd.random() * 0.012)
    for i in range(US + 1):
        u = i / US
        th = el - curl * u ** 1.3
        T = d * math.cos(th) + up * math.sin(th)
        N = -d * math.sin(th) + up * math.cos(th)  # the leaf's face, toward the inside of the head
        tw = twist * u
        S = side * math.cos(tw) + N * math.sin(tw)
        N = N * math.cos(tw) - side * math.sin(tw)
        pts.append(p.copy())
        frames.append((S, N))
        p = p + T * (L / US)
    # width: widest at `shape` along the leaf, a narrow stem at the base and a round tip
    a = shape / (1 - shape) * 0.5
    peak = shape ** a * math.sqrt(1 - shape)
    pale = hsl(h - 14, s * 0.5, min(92, l + 30))
    edge = hsl(h + 6, s + 6, l - 7)
    base = hsl(h, s, l)
    verts = []
    for i in range(US + 1):
        u = i / US
        prof = (u ** a * math.sqrt(max(0.0, 1 - u)) / peak) if u < 1 else 0.0
        prof = max(prof, 0.12 * (1 - u))  # the stem has some width
        half = Wd * 0.5 * prof * (1 + 0.06 * math.sin(u * 9 + ph1))
        S, N = frames[i]
        row = []
        for v in VS:
            x = v * half
            off = cup * x * x / max(Wd, 1e-4) * 2.2                                   # cupped sides
            off += ruffle * abs(v) ** 1.6 * math.sin(freq * (u * L + abs(v) * half * 0.6) * 40 + ph2 + (3.1 if v < 0 else 0)) * min(1, u * 3)
            off += crinkle * math.sin(u * 31 + ph1) * math.sin(v * 7.5 + ph2) * (1 - abs(v) * 0.4)  # savoyed bumps
            off -= 0.003 * (1 - u) * (1 if abs(v) < 0.12 else 0)                      # the midrib's groove
            q = pts[i] + S * x + N * off
            if q.z < 0.002:  # lie on the tray rather than go through it
                q.z = 0.002 + rnd.random() * 0.002
            vert = bm.verts.new(q)
            # colour: pale stem end, pale midrib, darker edge
            k = mixc(pale, base, smooth(0.0, 0.42, u))
            k = mixc(k, pale, (0.7 if v == 0 else 0.35 if abs(v) < 0.2 else 0) * (1 - u * 0.55))
            k = mixc(k, edge, smooth(0.55, 1.0, abs(v)) * 0.8)
            vert[col] = k
            row.append(vert)
        verts.append(row)
    for i in range(US):
        for j in range(len(VS) - 1):
            bm.faces.new((verts[i][j], verts[i + 1][j], verts[i + 1][j + 1], verts[i][j + 1]))

def head(bm, col, rnd, c, r, kind, hue, sat, lift):
    """A head of lettuce of radius about r at c: leaves from the outside in, round a golden-angle spiral."""
    hs, ls = rnd.uniform(-7, 7), rnd.uniform(-5, 5)
    if kind == 2:   # romaine: tall, strappy, upright, with tips that flop out
        rings = [(6, 0.7, 0.55, 1.1, 0.5, 36, 0.5), (10, 1.0, 1.2, 0.6, 1.0, 40, 0.45), (7, 0.88, 1.36, 0.3, 0.7, 47, 0.42),
                 (5, 0.65, 1.48, -0.1, 0.9, 56, 0.4)]
        n_len = 1.8
    elif kind == 1:  # loose leaf: lots of frilly leaves splaying out
        rings = [(14, 1.0, 0.45, 1.2, 0.3, 38, 0.64), (12, 0.88, 0.85, 1.0, 0.4, 42, 0.6), (9, 0.68, 1.15, 0.55, 0.5, 46, 0.56),
                 (5, 0.45, 1.35, 0.1, 0.7, 50, 0.5)]
        n_len = 1.15
    else:            # butterhead (and the young heads): soft round leaves round a cupped heart
        rings = [(12, 1.0, 0.35, 1.05, 0.45, 38, 0.52), (10, 0.85, 0.85, 0.55, 0.85, 44, 0.5), (8, 0.66, 1.15, -0.2, 1.2, 52, 0.48),
                 (6, 0.42, 1.3, -1.0, 1.6, 62, 0.45)]
        n_len = 1.0
    gold = math.pi * (3 - math.sqrt(5))
    i = rnd.randrange(100)
    for ri, (count, size, el, curl, cup, light, shape) in enumerate(rings):
        for _ in range(count):
            i += 1
            phi = i * gold + rnd.uniform(-0.25, 0.25)
            L = r * size * n_len * rnd.uniform(0.82, 1.12)
            if kind == 2:
                wd, ruffle, freq, crinkle = L * rnd.uniform(0.42, 0.52), 0.006, 1.2, 0.0045
            elif kind == 1:
                wd, ruffle, freq, crinkle = L * rnd.uniform(0.7, 0.9), 0.016 * (r / 0.2), 2.6, 0.003
            else:
                wd, ruffle, freq, crinkle = L * rnd.uniform(1.05, 1.3), 0.009, 0.8, 0.004
            sunlit = rnd.random() < 0.12
            h = hue + 6 - ri * 7 + hs + rnd.uniform(-6, 6) - (8 if sunlit else 0)
            s = sat + rnd.uniform(-8, 6) - ri * 4
            l = light + lift * 0.5 + ls + rnd.uniform(-5, 5) + (8 if sunlit else 0)
            leaf(bm, col, rnd, c, phi, el + rnd.uniform(-0.15, 0.15), L, wd, curl + rnd.uniform(-0.25, 0.25),
                 cup * rnd.uniform(0.8, 1.2), ruffle, freq, rnd.uniform(-0.35, 0.35), (h, s, l), shape, crinkle)

def build_head(k, lod):
    """Variety k's head at one level of detail. The same seed for both levels, so they match."""
    global RES
    RES = LODS[lod]
    kind, hue, sat, lift = VARIETIES[k]
    rnd = random.Random(4321 + k * 811)
    bm = bmesh.new()
    col = bm.verts.layers.float_color.new("Col")
    head(bm, col, rnd, Vector((0, 0, 0)), RADIUS[kind], 0 if kind == 3 else kind, hue, sat, lift + (6 if kind == 3 else 0))
    me = bpy.data.meshes.new(f"v{k}_{lod}")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(f"v{k}_{lod}", me)
    bpy.context.collection.objects.link(obj)
    return obj

def bake_ao(obj, ao_floor=0.6):
    """Ambient occlusion into the vertex colours, with the tray under the head."""
    me = obj.data
    me.materials.append(bpy.data.materials.get("bake") or bpy.data.materials.new("bake"))
    ao = me.color_attributes.new("AO", 'FLOAT_COLOR', 'POINT')
    me.color_attributes.active_color = ao
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    c, a = me.color_attributes["Col"], me.color_attributes["AO"]
    for i in range(len(c.data)):
        f = ao_floor + (1 - ao_floor) * a.data[i].color[0]
        r, g, b, _ = c.data[i].color
        c.data[i].color = (r * f, g * f, b * f, 1.0)
    me.color_attributes.remove(a)
    me.color_attributes.active_color = me.color_attributes["Col"]
    me.color_attributes.render_color_index = me.color_attributes.active_color_index
    me.materials.clear()

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.samples = 128
prefs = bpy.context.preferences.addons["cycles"].preferences
for dev in ("OPTIX", "CUDA", "HIP", "ONEAPI"):
    try:
        prefs.compute_device_type = dev
        prefs.get_devices()
        if any(d.type == dev for d in prefs.devices):
            for d in prefs.devices:
                d.use = d.type == dev
            sc.cycles.device = 'GPU'
            break
    except TypeError:
        continue
sc.world = sc.world or bpy.data.worlds.new("World")
sc.world.light_settings.distance = 0.12

bpy.ops.mesh.primitive_plane_add(size=3, location=(0, 0, 0))
tray = bpy.context.active_object
heads = []
for k in range(len(VARIETIES)):
    for lod in LODS:
        obj = build_head(k, lod)
        bake_ao(obj)
        heads.append(obj)
        print(f"{obj.name}: {len(obj.data.vertices)} vertices, {sum(len(p.vertices) - 2 for p in obj.data.polygons)} triangles")
bpy.data.objects.remove(tray, do_unlink=True)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
opts = dict(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
            export_materials='NONE', export_texcoords=False, export_normals=True, export_attributes=False,
            export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_animations=False)
for key in list(opts):
    if key not in props:
        print("export option not in this Blender:", key)
        opts.pop(key)
bpy.ops.object.select_all(action='DESELECT')
for o in heads:
    o.select_set(True)
bpy.ops.export_scene.gltf(**opts)
print("wrote", OUT, os.path.getsize(OUT), "bytes")

if PREVIEW:  # the detailed heads in two rows, for a quick look
    his = [h for h in heads if h.name.endswith("_hi")]
    for n, o in enumerate(his):
        o.location = ((n % 4 - 1.5) * 0.5, (n // 4) * 0.5, 0)
    for o in heads:
        o.hide_render = o not in his
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading
    sh.light, sh.color_type, sh.show_shadows = 'STUDIO', 'VERTEX', True
    sc.render.resolution_x, sc.render.resolution_y = 1200, 700
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.location = (0, -2.1, 1.1)
    cam.rotation_euler = (Vector((0, 0.25, 0.05)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)

if BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
