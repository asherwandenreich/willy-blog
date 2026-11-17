"""
Builds the tree trunks for the home page's lily field (components/SpiderLilyModel.tsx) and exports them to
public/models/trunks/trunks.glb.

Run from the project folder:
    blender -b --factory-startup -P scripts/blender/trunks.py -- [--preview out.png] [--blend out.blend]

Three trunks (trunk_0 to trunk_2), each 14 tall with a base radius of 1, following the scene's own trunk
shape exactly (tapering to 0.55 at the top, flared at the foot: see trunkRadiusAt), so the scene can scale,
bend and lean them per tree and the ivy and branches it places still sit on the bark. On top of that shape:
deep furrows between plates of bark, buttress roots spreading into the ground, and a few burls.

Each carries only COLOR_0, a grey the scene multiplies its own bark colour by: darker down the furrows and
in the crooks of the roots (baked ambient occlusion). Blender is z-up; the export turns it y-up.
"""
import os, sys, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa: F401,F403
from mathutils import noise

OUT = arg("--out", os.path.join(ROOT, "public", "models", "trunks", "trunks.glb"))
HEIGHT, RADIAL, RINGS, BELOW = 14.0, 64, 44, 0.45  # BELOW: how far the roots reach under the ground

taper = lambda y: (1 - 0.45 * max(y, 0) / HEIGHT) * (1 + 0.7 * math.exp(-max(y, 0) * 2.5))  # trunkRadiusAt / radius

def trunk(seed):
    rng = random.Random(seed)
    off = Vector((rng.random() * 100, rng.random() * 100, rng.random() * 100))
    ridges = rng.choice((7, 8, 9))
    roots = [(rng.random() * 2 * math.pi, 0.4 + rng.random() * 0.45, 0.38 + rng.random() * 0.14) for _ in range(rng.randint(4, 6))]
    burls = [(rng.random() * 2 * math.pi, 1.6 + rng.random() * 6, 0.12 + rng.random() * 0.1) for _ in range(rng.randint(1, 3))]
    wrap = lambda d: (d + math.pi) % (2 * math.pi) - math.pi

    bm = bmesh.new()
    rings, greys = [], {}
    for i in range(RINGS + 1):
        y = -BELOW + (HEIGHT + BELOW) * (i / RINGS) ** 1.7  # rings packed towards the foot, where the camera looks
        ring = []
        for k in range(RADIAL):
            a = 2 * math.pi * k / RADIAL
            dir2 = Vector((math.cos(a), math.sin(a), 0))
            # furrows: ridges running up the trunk, wandering, broken into plates
            u = a * ridges / (2 * math.pi) + 0.9 * noise.noise(off + Vector((dir2.x * 0.6, dir2.y * 0.6, y * 0.12)))
            plate = abs(math.sin(math.pi * u)) ** 0.5  # plates, with furrows between them
            # horizontal cracks breaking each column of plates, staggered from column to column (y is in the
            # scene's units, unscaled, so they come every half metre or so)
            n = abs(noise.noise(off + Vector((math.floor(u) * 3.1, 0.0, y * 2.2))))
            crack = max(0.0, min(1.0, (0.22 - n) / 0.17))
            plate *= 1 - 0.8 * crack
            bark = 0.2 * plate - 0.18  # deep furrows; plates stand at most 2% proud, where the scene hangs its ivy
            # buttress roots, fading out up the trunk and carrying on under the ground
            root = sum(h * math.exp(-(wrap(a - ra) / w) ** 2) for ra, h, w in roots) * math.exp(-max(y, 0) * 2.6)
            if y < 0:
                root *= 1 + (-y / BELOW) * 0.6
            burl = sum(h * math.exp(-(wrap(a - ba) / 0.28) ** 2 - ((y - by) / 0.35) ** 2) for ba, by, h in burls)
            r = taper(y) * (1 + bark + burl) + root
            v = bm.verts.new((dir2.x * r, dir2.y * r, y))
            # furrows dark, plates light; the burls' bark a little darker too
            lichen = 0.85 + 0.3 * (0.5 + 0.5 * noise.noise(off * 2 + Vector((dir2.x * 2, dir2.y * 2, y * 0.8))))
            # (kept within 1, so the export can store it compactly)
            greys[v] = min(1.0, (0.12 + 0.88 * plate ** 1.3) * lichen * (1 - 0.25 * min(1, burl * 4)))
            ring.append(v)
        rings.append(ring)
    for A, B in zip(rings, rings[1:]):
        for k in range(RADIAL):
            k2 = (k + 1) % RADIAL
            bm.faces.new((A[k], A[k2], B[k2], B[k]))
    bm.verts.index_update()
    grey = {v.index: g for v, g in greys.items()}
    me = bpy.data.meshes.new(f"trunk_{len(trunks)}")
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(me.name, me)
    bpy.context.collection.objects.link(obj)
    col = me.color_attributes.new("Col", 'FLOAT_COLOR', 'POINT')
    for i, g in grey.items():
        col.data[i].color = (g, g, g, 1.0)
    return obj

trunks = []
for seed in (11, 23, 37):
    trunks.append(trunk(seed))

# ---- bake ambient occlusion (the ground shades the roots' crooks) into each trunk's grey
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
ground = bpy.context.active_object
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 192
if scene.world is None:
    scene.world = bpy.data.worlds.new("World")
scene.world.light_settings.distance = 0.9
for n, obj in enumerate(trunks):
    obj.location.x = n * 8  # apart, so they don't shade each other
for obj in trunks:
    me = obj.data
    me.materials.append(bpy.data.materials.new("bake"))
    ao = me.color_attributes.new("AO", 'FLOAT_COLOR', 'POINT')
    me.color_attributes.active_color = ao
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    col, ao = me.color_attributes["Col"], me.color_attributes["AO"]
    for i in range(len(col.data)):
        k = 0.3 + 0.7 * ao.data[i].color[0]
        c = col.data[i].color
        col.data[i].color = (c[0] * k, c[1] * k, c[2] * k, 1.0)
    me.color_attributes.remove(ao)
    me.color_attributes.active_color = me.color_attributes["Col"]
    me.color_attributes.render_color_index = me.color_attributes.active_color_index
    me.materials.clear()
    print(f"{obj.name}: {len(me.vertices)} vertices, {sum(len(p.vertices) - 2 for p in me.polygons)} triangles")

# ---- export them at the origin, side by side in the file
for obj in trunks:
    obj.location.x = 0
os.makedirs(os.path.dirname(OUT), exist_ok=True)
props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
opts = dict(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
            export_materials='NONE', export_texcoords=False, export_normals=False, export_attributes=False,
            export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_animations=False)
for key in list(opts):
    if key not in props:
        opts.pop(key)
bpy.ops.object.select_all(action='DESELECT')
for obj in trunks:
    obj.select_set(True)
bpy.ops.export_scene.gltf(**opts)
print("wrote", OUT, os.path.getsize(OUT), "bytes")

# ---- preview: the four feet side by side, from about where the camera stands
if PREVIEW:
    for n, obj in enumerate(trunks):
        obj.location.x = (n - 1.5) * 7
        for poly in obj.data.polygons:
            poly.use_smooth = True
    scene.render.engine = 'BLENDER_WORKBENCH'
    sh = scene.display.shading
    sh.light, sh.color_type, sh.show_shadows = 'STUDIO', 'VERTEX', True
    sh.shadow_intensity = 0.4
    scene.render.resolution_x, scene.render.resolution_y = 1400, 800
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.lens = 35
    base, ext = os.path.splitext(PREVIEW)
    for tag, loc, aim in [("a", (0, -30, 6), (0, 0, 4)), ("b", (-10.5, -9, 3), (-10.5, 0, 2.2))]:
        cam.location = loc
        cam.rotation_euler = (Vector(aim) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = f"{base}_{tag}{ext}"
        bpy.ops.render.render(write_still=True)
        print("preview", scene.render.filepath)
if BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
