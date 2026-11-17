"""
Shared helpers for the Blender scripts that build the river scene's models (pavilion.py, bridge.py,
lantern.py). Each script builds its parts with these, then calls finish() to join them, bake ambient
occlusion into the colours and export a .glb for components/RiverBackground.tsx.

The scene draws these models with its own flat-shaded material, so a model carries only:
  COLOR_0  each part's colour (sRGB hex, stored linear as THREE.Color does) darkened by baked occlusion
  _AWOOD   what the scene's wood-grain shader reads (see painted/woodify): along the grain, across it,
           and how strong; zero for anything that isn't timber
Blender is z-up; the export turns it y-up.
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PREVIEW, BLEND = arg("--preview"), arg("--blend")

def lin(hexstr):  # sRGB hex to linear, as THREE.Color(hex) does
    h = hexstr.lstrip("#")
    def ch(s):
        c = int(s, 16) / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (ch(h[0:2]), ch(h[2:4]), ch(h[4:6]), 1.0)

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)

parts = []
WOOD = {}  # grain set vertex by vertex while building (see sweep), for timber that bends

def part(color, wood=None, under=None, over=None, closed=True, name="part"):
    """Used as a decorator, or called on a lambda: build(bm) fills a bmesh, which becomes one object.
    wood: (axis, amount) for straight timber. under / over: colours for faces pointing down (rafters) or up
    (moss)."""
    def wrap(build):
        bm = bmesh.new()
        WOOD.clear()
        build(bm)
        if closed:
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.verts.index_update()
        grain = {v.index: g for v, g in WOOD.items() if v.is_valid}
        WOOD.clear()
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        obj = bpy.data.objects.new(name, me)
        bpy.context.collection.objects.link(obj)
        # colours per vertex, not per face corner, so the export can share vertices between faces
        col = me.color_attributes.new("Col", 'FLOAT_COLOR', 'POINT')
        c = lin(color)
        for d in col.data:
            d.color = c
        for tone, test in ((under, lambda z: z < -0.3), (over, lambda z: z > 0.6)):
            if tone:
                for poly in me.polygons:
                    if test(poly.normal.z):
                        for vi in poly.vertices:
                            col.data[vi].color = lin(tone)
        aw = me.attributes.new("_AWOOD", 'FLOAT_VECTOR', 'POINT')
        if wood:  # as painted(): along the grain, across it (over every face), and how strong
            ax = Vector(wood[0]).normalized()
            a = ax.cross(Vector((0, 0, 1)) if abs(ax.z) < 0.9 else Vector((1, 0, 0))).normalized()
            b = ax.cross(a)
            for v in me.vertices:
                aw.data[v.index].vector = (v.co.dot(ax), v.co.dot(a) + v.co.dot(b), wood[1])
        for i, g in grain.items():
            aw.data[i].vector = g
        parts.append(obj)
        return obj
    return wrap

# ---- shapes (all add into a bmesh)
def corner(k, r=1.0, phase=0.0):  # hexagon corners at 0, 60, 120... degrees
    a = phase + k * math.pi / 3
    return Vector((r * math.cos(a), r * math.sin(a), 0))

def circle(segs):
    return lambda r: [(r * math.cos(2 * math.pi * k / segs), r * math.sin(2 * math.pi * k / segs)) for k in range(segs)]

def petals(segs, n, depth):  # a ring scalloped into n lotus petals
    return lambda r: [(r * (1 + depth * abs(math.cos(n * math.pi * k / segs))) * math.cos(2 * math.pi * k / segs),
                       r * (1 + depth * abs(math.cos(n * math.pi * k / segs))) * math.sin(2 * math.pi * k / segs)) for k in range(segs)]

def hexagon(per_edge):  # a hexagon with each edge split in per_edge, so baked shading has points to land on
    def ring(r):
        out = []
        for k in range(6):
            p, q = corner(k, r), corner(k + 1, r)
            out += [(p.x + (q.x - p.x) * i / per_edge, p.y + (q.y - p.y) * i / per_edge) for i in range(per_edge)]
        return out
    return ring

def lathe(bm, profile, ring, at=(0, 0, 0), caps=True, loop=False):
    """Sweep (r, z) profile points round a ring shape. loop: join the last profile point to the first."""
    rings = []
    for r, z in profile:
        pts = [(0.0, 0.0)] if r <= 1e-6 else ring(r)
        rings.append([bm.verts.new((at[0] + x, at[1] + y, at[2] + z)) for x, y in pts])
    pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if loop else [])
    for A, B in pairs:
        n = max(len(A), len(B))
        for k in range(n):
            k2 = (k + 1) % n
            if len(A) == 1:
                bm.faces.new((A[0], B[k], B[k2]))
            elif len(B) == 1:
                bm.faces.new((A[k], A[k2], B[0]))
            else:
                bm.faces.new((A[k], A[k2], B[k2], B[k]))
    if caps and not loop:
        for R in (rings[0], rings[-1]):
            if len(R) > 2:
                bm.faces.new(R)

def beam(bm, p0, p1, w, h):
    """A box from p0 to p1, w wide and h high (h is vertical unless the beam is)."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    q = d.to_track_quat('X', 'Y' if abs(d.normalized().z) > 0.99 else 'Z')
    m = Matrix.Translation((p0 + p1) / 2) @ q.to_matrix().to_4x4() @ Matrix.Diagonal((d.length, w, h, 1))
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)

def tube(bm, pts, r0, r1=None, sides=6):
    """A tube through pts, its radius going from r0 to r1."""
    r1 = r0 if r1 is None else r1
    rings = []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        a = d.cross(Vector((0, 0, 1)))
        if a.length < 1e-4:
            a = d.cross(Vector((1, 0, 0)))
        a.normalize()
        b = d.cross(a)
        r = r0 + (r1 - r0) * i / (len(pts) - 1)
        rings.append([bm.verts.new(p + r * (math.cos(2 * math.pi * k / sides) * a + math.sin(2 * math.pi * k / sides) * b))
                      for k in range(sides)])
    for A, B in zip(rings, rings[1:]):
        for k in range(sides):
            k2 = (k + 1) % sides
            bm.faces.new((A[k], A[k2], B[k2], B[k]))
    bm.faces.new(rings[0])
    bm.faces.new(rings[-1])

def sweep(bm, path, profile, side=Vector((0, 1, 0)), wood=0.0):
    """Sweep a cross-section along a path that bends in a vertical plane (a bridge's beams and rails).
    profile: (u, v) points round the section, u along `side` and v up from the path. With wood, the grain
    runs along the path."""
    s, rings = 0.0, []
    for i, p in enumerate(path):
        if i:
            s += (p - path[i - 1]).length
        t = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        up = t.cross(side).normalized()
        if up.z < 0:
            up = -up
        ring = []
        for u, v in profile:
            vert = bm.verts.new(p + side * u + up * v)
            if wood:
                WOOD[vert] = (s, u + v, wood)
            ring.append(vert)
        rings.append(ring)
    n = len(profile)
    for A, B in zip(rings, rings[1:]):
        for k in range(n):
            k2 = (k + 1) % n
            bm.faces.new((A[k], A[k2], B[k2], B[k]))
    bm.faces.new(rings[0])
    bm.faces.new(rings[-1])

def rect(w, h, v0=0.0):  # a cross-section w wide and h high, its bottom at v0
    return [(-w / 2, v0), (w / 2, v0), (w / 2, v0 + h), (-w / 2, v0 + h)]

def roof_point(R, s, t, v):
    """A point on a hexagonal roof: sector s, t along the eave (0 and 1 at the hips), v down the slope.
    Concave like a Chinese roof (steep at the top, flattening to the eave), its corners swept out and up,
    with rows of tiles running down the slope (if it has tiles)."""
    P = corner(s).lerp(corner(s + 1), t)
    c3 = abs(2 * t - 1) ** 3  # 1 at the hips, 0 mid-eave
    r = (R["r_top"] + (R["r_eave"] - R["r_top"]) * v) * (1 + R["out"] * c3 * v * v)
    z = R["z_top"] - (R["z_top"] - R["z_eave"]) * (1 - (1 - v) ** R.get("curve", 1.8)) + R["lift"] * c3 * v ** 2.5
    if R.get("tiles"):
        z += 0.02 * R["r_eave"] * (0.5 + 0.5 * math.cos(2 * math.pi * R["tiles"] * t)) * min(1.0, v * 4)
    return Vector((P.x * r, P.y * r, z))

def roof_surface(bm, R, U, V):
    """The roof as a solid shell in bm (U points along each eave, V down the slope)."""
    grid = {}
    for s in range(6):
        for i in range(U + 1):
            for j in range(V + 1):
                grid[s, i, j] = bm.verts.new(roof_point(R, s, i / U, j / V))
    for s in range(6):
        for i in range(U):
            for j in range(V):
                bm.faces.new((grid[s, i, j], grid[s, i, j + 1], grid[s, i + 1, j + 1], grid[s, i + 1, j]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)  # join the sectors at the hips
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=R["thick"])

# ---- join, bake, export, preview
def finish(out, ao_distance, ground_z=None, views=(), lens=50, ao_floor=0.35, samples=256):
    """Join every part into one mesh, bake ambient occlusion into its colours (never darker than ao_floor),
    export it to out, and render the preview views [(camera location, aim)] if --preview was given."""
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = os.path.splitext(os.path.basename(out))[0]
    me = obj.data
    print(f"{obj.name}: {len(me.vertices)} vertices, {sum(len(p.vertices) - 2 for p in me.polygons)} triangles")

    ground = None
    if ground_z is not None:  # what it stands on, to shade its foot
        bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, ground_z))
        ground = bpy.context.active_object

    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    if scene.world is None:
        scene.world = bpy.data.worlds.new("World")
    scene.world.light_settings.distance = ao_distance
    me.materials.append(bpy.data.materials.new("bake"))
    ao = me.color_attributes.new("AO", 'FLOAT_COLOR', 'POINT')
    me.color_attributes.active_color = ao
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')

    col, ao = me.color_attributes["Col"], me.color_attributes["AO"]
    for i in range(len(col.data)):
        k = ao_floor + (1 - ao_floor) * ao.data[i].color[0]
        c = col.data[i].color
        col.data[i].color = (c[0] * k, c[1] * k, c[2] * k, 1.0)
    me.color_attributes.remove(ao)
    me.color_attributes.active_color = me.color_attributes["Col"]
    me.color_attributes.render_color_index = me.color_attributes.active_color_index
    me.materials.clear()

    os.makedirs(os.path.dirname(out), exist_ok=True)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    opts = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                # no normals: the scene draws it flat-shaded, working them out per pixel
                export_materials='NONE', export_texcoords=False, export_normals=False, export_attributes=True,
                export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_animations=False)
    for key in list(opts):
        if key not in props:
            print("export option not in this Blender:", key)
            opts.pop(key)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.ops.export_scene.gltf(**opts)
    print("wrote", out, os.path.getsize(out), "bytes")

    if PREVIEW:
        scene.render.engine = 'BLENDER_WORKBENCH'
        sh = scene.display.shading
        sh.light, sh.color_type, sh.show_shadows = 'STUDIO', 'VERTEX', True
        sh.shadow_intensity = 0.4
        scene.render.resolution_x, scene.render.resolution_y = 1000, 800
        cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
        scene.collection.objects.link(cam)
        scene.camera = cam
        cam.data.lens = lens
        base, ext = os.path.splitext(PREVIEW)
        for n, (loc, aim) in enumerate(views):
            cam.location = loc
            cam.rotation_euler = (Vector(aim) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
            scene.render.filepath = f"{base}_{'abcdefgh'[n]}{ext}"
            bpy.ops.render.render(write_still=True)
            print("preview", scene.render.filepath)

    if BLEND:
        bpy.ops.wm.save_as_mainfile(filepath=BLEND)
