"use client";

import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// The Rustbreeder backdrop: walking slowly down a bright, misty vertical-farm greenhouse. Steel racks either side
// hold tiers of white trays full of lettuce; an irrigation line with red clamps runs along each rack, grow-light
// bars hang over the aisle, and green greenhouse trusses arch above. Yellow markings split the floor into two
// lanes: arrows on the right lead on down the aisle, arrows on the left come back toward you. The pointer nudges
// the camera and bumping `kick` (Finalize does) makes it surge forward. Reduced motion gets one still frame.
//
// It's a three.js scene over a painted sky-and-floor canvas. The lettuce heads are real 3D models built in
// Blender (scripts/blender/lettuce.py, public/models/lettuce/lettuce.glb): one head per variety, at two levels
// of detail, laid out six or eight to a tray as instances, each turned and sized at random. The racks and roof
// are flat-coloured geometry, built a one-metre slice at a time; slices that fall behind the camera move to the
// far end, so the aisle never ends.

const FOG = "#edf2eb";
const hash = (a: number, b: number) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
const col = (h: string) => new THREE.Color(h);
const fogged = (h: string, t: number) => col(h).lerp(col(FOG), t); // a colour partway into the mist, for thin far-off lines

const C = {
    trayTop: col("#fbfdfb"), trayUnder: col("#dfe6e1"), trayEnd: col("#ffffff"), trayFront: col("#e7ece8"), ridge: col("#c9d3cc"),
    shadow: col("#b9c4bd"), steel: col("#f2f5f2"), steelSide: col("#cdd5cf"), slot: col("#7d8a82"), pipe: col("#3b4541"),
    clamp: col("#d4453b"), rib: col("#7fae89"), ribDark: col("#5f9068"), ribLight: fogged("#7fae89", 0.3), trim: col("#e6d63a"),
    light: col("#ffffff"),
};

// eye at y = 0; the camera walks the aisle at x = 0 toward +z (three.js's -z: everything is flipped as it's built)
const FLOOR = -1.75, TIERS = [-1.3, -0.75, -0.2, 0.35, 0.9, 1.45], ROOF = 2.05;
const XI = 1.15, XO = 2.45;  // rack: aisle-side edge and back edge
const GAP = 1.0, TRAY = 0.78, FAR = 30;
const SLICES = 48;           // one per metre; a multiple of 24, the period of every repeating pattern below
const DETAIL = 7;            // the nearest slices get the detailed lettuce
const VARIETIES = 8, YOUNG = 5; // the young heads (variety 5) go eight to a tray
const GLAZING = [-2.5, -1.9, -1.25, -0.6, 0, 0.6, 1.25, 1.9, 2.5];
const archY = (x: number) => { const u = (x + 2.95) / 5.9; return (1 - u) ** 2 * ROOF + 2 * (1 - u) * u * 3.75 + u * u * ROOF; };

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const at = (p: V3, a: V3, s: number, b: V3, t: number): V3 => [p[0] + a[0] * s + b[0] * t, p[1] + a[1] * s + b[1] * t, p[2] + a[2] * s + b[2] * t];

// flat-coloured triangles in farm coordinates (z forward), turned into a three.js geometry
class Mesher {
    pos: number[] = [];
    rgb: number[] = [];
    tri(a: V3, b: V3, c: V3, k: THREE.Color) {
        for (const p of [a, b, c]) { this.pos.push(p[0], p[1], -p[2]); this.rgb.push(k.r, k.g, k.b); }
    }
    quad(a: V3, b: V3, c: V3, d: V3, k: THREE.Color) { this.tri(a, b, c, k); this.tri(a, c, d, k); }
    // a box from a to b, w across and h "up" (perpendicular to it, in its vertical plane); its upper face can differ
    bar(a: V3, b: V3, w: number, h: number, k: THREE.Color, top = k) {
        const d = norm(sub(b, a));
        let u = cross(d, [0, 1, 0]);
        u = Math.hypot(...u) < 1e-3 ? [1, 0, 0] : norm(u);
        const v = norm(cross(u, d));
        const c = (p: V3, s: number, t: number) => at(p, u, (s * w) / 2, v, (t * h) / 2);
        const A = [c(a, -1, -1), c(a, 1, -1), c(a, 1, 1), c(a, -1, 1)], B = [c(b, -1, -1), c(b, 1, -1), c(b, 1, 1), c(b, -1, 1)];
        for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; this.quad(A[i], A[j], B[j], B[i], i === 2 ? top : k); }
        this.quad(A[0], A[1], A[2], A[3], k);
        this.quad(B[0], B[1], B[2], B[3], k);
    }
    // an axis-aligned box with a colour per face
    box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, f: { top: THREE.Color; bottom: THREE.Color; x0: THREE.Color; x1: THREE.Color; z: THREE.Color }) {
        this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], f.top);
        this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], f.bottom);
        this.quad([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], f.x0);
        this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], f.x1);
        this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], f.z);
        this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], f.z);
    }
    // a flat strip on the floor
    floor(x0: number, x1: number, z0: number, z1: number, k: THREE.Color) {
        const y = FLOOR + 0.002;
        this.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], k);
    }
    geometry() {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
        g.setAttribute("color", new THREE.Float32BufferAttribute(this.rgb, 3));
        return g;
    }
}

// one metre of farm (slice k, from z = 0 to 1): floor markings, roof, and both racks. Which trusses, arrows,
// plates and trims it has depends only on k % 24, so a slice can be moved on by SLICES and still fit.
function buildSlice(k: number) {
    const m = new Mesher(), cloth = new Mesher();

    // floor: yellow aisle edges and a solid double line down the middle, splitting the walkway into two lanes.
    // The right lane's arrows point on down the aisle and the left lane's point back at you, an arrow every
    // three metres, alternating lanes.
    for (const s of [-0.85, 0.85]) m.floor(s - 0.0225, s + 0.0225, 0, GAP, C.trim);
    for (const s of [-0.035, 0.035]) m.floor(s - 0.011, s + 0.011, 0, GAP, C.trim);
    for (const [lane, dir, when] of [[0.43, 1, 3], [-0.43, -1, 0]] as const) {
        if (k % 6 !== when) continue;
        const p = (x: number, u: number): V3 => [lane + x, FLOOR + 0.002, 0.1 + (dir > 0 ? u : 1 - u)]; // u: tail 0 to tip 1
        m.quad(p(-0.06, 0), p(0.06, 0), p(0.06, 0.62), p(-0.06, 0.62), C.trim);
        m.tri(p(-0.19, 0.62), p(0.19, 0.62), p(0, 1), C.trim);
    }

    // roof, running down the aisle: glazing bars on the arch, gutters, heating pipes, a misting line
    for (const x of GLAZING) m.bar([x, archY(x), 0], [x, archY(x), GAP], 0.014, 0.014, C.ribLight);
    for (const s of [-1, 1]) {
        m.bar([s * 2.95, ROOF, 0], [s * 2.95, ROOF, GAP], 0.06, 0.06, C.ribDark);
        m.bar([s * 1.7, ROOF + 0.2, 0], [s * 1.7, ROOF + 0.2, GAP], 0.055, 0.055, C.steelSide, C.light);
        m.bar([s * 0.55, ROOF + 0.45, 0], [s * 0.55, ROOF + 0.45, GAP], 0.012, 0.012, C.slot);
        m.bar([s * 0.55, ROOF + 0.45, 0.5], [s * 0.55, ROOF + 0.35, 0.5], 0.01, 0.01, C.slot); // nozzle drop
    }
    if (k % 8 === 4) cloth.quad([-2.3, ROOF + 0.55, 0], [2.3, ROOF + 0.55, 0], [2.3, ROOF + 0.55, 4], [-2.3, ROOF + 0.55, 4], C.light);

    const arch = (w: number, k2: THREE.Color) => {
        for (let i = 0; i < 24; i++) {
            const x0 = -2.95 + (5.9 * i) / 24, x1 = -2.95 + (5.9 * (i + 1)) / 24;
            m.bar([x0, archY(x0), 0], [x1, archY(x1), 0], 0.05, w, k2);
        }
    };
    if (k % 4 === 0) { // main truss: posts, arch, tie beam with zig-zag webbing, and a hanging grow-light bar
        for (const s of [-1, 1]) m.bar([s * 2.95, FLOOR, 0], [s * 2.95, ROOF, 0], 0.07, 0.07, C.ribDark);
        arch(0.08, C.rib);
        m.bar([-2.95, ROOF + 0.06, 0], [2.95, ROOF + 0.06, 0], 0.04, 0.04, C.rib);
        for (let i = 0; i < 10; i++) {
            const xa = -2.95 + (5.9 * i) / 10, xb = -2.95 + (5.9 * (i + 1)) / 10;
            m.bar([xa, i % 2 ? archY(xa) : ROOF + 0.06, 0], [xb, i % 2 ? ROOF + 0.06 : archY(xb), 0], 0.022, 0.022, C.ribLight);
        }
        for (const s of [-0.7, 0.7]) m.bar([s, 1.92, 0], [s, ROOF + 0.06, 0], 0.01, 0.01, C.slot);
        m.box(-0.9, 0.9, 1.85, 1.92, -0.03, 0.03, { top: C.steelSide, bottom: C.light, x0: C.steelSide, x1: C.steelSide, z: C.steelSide });
    } else if (k % 2 === 0) arch(0.035, C.ribLight); // lighter secondary rafter in between

    // the racks
    for (const side of [-1, 1]) {
        const xi = side * XI, xo = side * XO, lo = Math.min(xi, xo), hi = Math.max(xi, xo);
        const aisle = xi - side * 0.002; // just proud of the trays' aisle ends, for the strips painted on them

        // irrigation line along the rack, clamped at every other upright
        m.bar([xi + side * 0.08, -0.5, 0], [xi + side * 0.08, -0.5, GAP], 0.02, 0.02, C.pipe);
        if (k % 2 === 0) m.bar([xi + side * 0.08, -0.54, 0.03], [xi + side * 0.08, -0.46, 0.03], 0.05, 0.05, C.clamp);

        TIERS.forEach((y, ti) => {
            // tray: white top, grey underside, the bright rounded end facing the aisle
            m.box(lo, hi, y - 0.09, y, 0, TRAY, { top: C.trayTop, bottom: C.trayUnder, x0: side < 0 ? C.trayUnder : C.trayEnd, x1: side < 0 ? C.trayEnd : C.trayUnder, z: C.trayFront });
            const strip = (y0: number, y1: number, z0: number, z1: number, k2: THREE.Color) => m.quad([aisle, y0, z0], [aisle, y1, z0], [aisle, y1, z1], [aisle, y0, z1], k2);
            strip(y - 0.033, y - 0.027, 0.05, TRAY - 0.05, C.ridge); // moulded ridges
            strip(y - 0.063, y - 0.057, 0.05, TRAY - 0.05, C.ridge);
            strip(y - 0.1, y - 0.09, 0, TRAY, C.shadow);
            if ((k + ti) % 3 === 0) strip(y - 0.016, y - 0.002, 0.08, TRAY - 0.08, C.trim);
        });

        if (k % 2 === 0) { // steel upright with punched slots down its face
            const ux = xi + side * 0.06;
            m.box(Math.min(xi, ux), Math.max(xi, ux), FLOOR, ROOF - 0.15, 0, 0.06, { top: C.steel, bottom: C.steel, x0: C.steelSide, x1: C.steelSide, z: C.steel });
            for (let y = FLOOR + 0.2; y < ROOF - 0.3; y += 0.14) {
                const x = xi + side * 0.03;
                m.quad([x - 0.006, y, -0.002], [x + 0.006, y, -0.002], [x + 0.006, y + 0.06, -0.002], [x - 0.006, y + 0.06, -0.002], C.slot);
            }
        }
    }
    return { geo: m.geometry(), cloth: cloth.pos.length ? cloth.geometry() : null };
}

// misty daylight above, a pale wet floor below, brightest down the far end of the aisle
function paintBackdrop(c: HTMLCanvasElement, w: number, h: number, vx: number, vy: number) {
    c.width = w; c.height = h;
    const g = c.getContext("2d")!;
    const sky = g.createLinearGradient(0, 0, 0, vy);
    sky.addColorStop(0, "#f3f7f2"); sky.addColorStop(1, "#edf2eb");
    g.fillStyle = sky; g.fillRect(0, 0, w, vy);
    const floor = g.createLinearGradient(0, vy, 0, h);
    floor.addColorStop(0, "#edf2eb"); floor.addColorStop(0.3, "#dfe7df"); floor.addColorStop(1, "#cbd6cd");
    g.fillStyle = floor; g.fillRect(0, vy, w, h - vy);
    g.globalAlpha = 0.35; g.fillStyle = "#fff"; // wet sheen
    for (let i = 0; i < 18; i++) { const y = vy + (h - vy) * (i / 18) ** 1.6; g.fillRect(vx - (y - vy) * 0.9, y, (y - vy) * 1.8, 1); }
    g.globalAlpha = 1;
    const glow = g.createRadialGradient(vx, vy, 0, vx, vy, Math.max(w, h) * 0.45);
    glow.addColorStop(0, "rgba(255,255,255,1)"); glow.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = glow; g.fillRect(0, 0, w, h);
}

// a stencil plate on an upright: rack side and number, yellow on black
function paintPlate(c: HTMLCanvasElement, text: string, font: string) {
    const g = c.getContext("2d")!;
    g.fillStyle = "#29312e"; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#e6d63a"; g.font = `600 ${c.height * 0.62}px ${font}`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, c.width / 2, c.height * 0.54);
}

export default function FarmBackground({ kick }: { kick: RefObject<number> }) {
    const backRef = useRef<HTMLCanvasElement>(null), glRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const back = backRef.current!, canvas = glRef.current!;
        const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
        const mono = getComputedStyle(canvas).getPropertyValue("--rb-mono").trim() || "monospace";
        let renderer: THREE.WebGLRenderer;
        try {
            renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
        } catch {
            paintBackdrop(back, innerWidth, innerHeight, innerWidth * 0.56, innerHeight * 0.44); // no WebGL: just the greenhouse light
            return;
        }
        renderer.setClearColor(0x000000, 0);
        renderer.autoClear = false;

        const scene = new THREE.Scene();
        scene.fog = new THREE.Fog(FOG, -1, FAR + 1);
        const camera = new THREE.PerspectiveCamera(50, 1, 0.05, FAR + 4);
        scene.add(new THREE.HemisphereLight(0xffffff, 0xc4d2c4, 3.2));
        const sun = new THREE.DirectionalLight(0xfffbf0, 2.2);
        sun.position.set(0.4, 1, -0.3);
        scene.add(sun);

        // ---- the slices: geometry built once for each, moved on as the camera passes
        const flat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
        const clothMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
        const plateGeo = new THREE.PlaneGeometry(0.21, 0.14);
        const disposables: { dispose(): void }[] = [flat, clothMat, plateGeo];
        type Plate = { side: number; canvas: HTMLCanvasElement; tex: THREE.CanvasTexture };
        const slices = Array.from({ length: SLICES }, (_, k) => {
            const group = new THREE.Group(), { geo, cloth } = buildSlice(k), plates: Plate[] = [];
            group.add(new THREE.Mesh(geo, flat));
            disposables.push(geo);
            if (cloth) { group.add(new THREE.Mesh(cloth, clothMat)); disposables.push(cloth); }
            if (k % 6 === 0) for (const side of [-1, 1]) {
                const pc = document.createElement("canvas");
                pc.width = 96; pc.height = 64;
                const tex = new THREE.CanvasTexture(pc);
                tex.colorSpace = THREE.SRGBColorSpace;
                const mat = new THREE.MeshBasicMaterial({ map: tex });
                const plate = new THREE.Mesh(plateGeo, mat);
                plate.position.set(side * XI + side * 0.03, 0.05, 0.004);
                group.add(plate);
                disposables.push(tex, mat);
                plates.push({ side, canvas: pc, tex });
            }
            scene.add(group);
            return { group, k: -1, plates };
        });
        const place = (s: (typeof slices)[number], k: number) => {
            s.k = k;
            s.group.position.z = -k * GAP;
            for (const p of s.plates) { paintPlate(p.canvas, `${p.side < 0 ? "A" : "B"}${String(k % 100).padStart(2, "0")}`, mono); p.tex.needsUpdate = true; }
        };
        slices.forEach((s, k) => place(s, k));

        // ---- the lettuce: an instanced mesh per variety and level of detail, refilled whenever the camera
        // crosses into the next slice (the nearest slices get the detailed heads, the far end none at all)
        const leafMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
        disposables.push(leafMat);
        const CAP = SLICES * 2 * TIERS.length * 8;
        let lettuce: { hi: THREE.InstancedMesh; lo: THREE.InstancedMesh }[] | null = null;
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v3 = new THREE.Vector3(), sc = new THREE.Vector3(), tint = new THREE.Color();
        const fillLettuce = (cam: number) => {
            if (!lettuce) return;
            const counts = lettuce.map(() => ({ hi: 0, lo: 0 }));
            for (const s of slices) {
                const dz = s.k * GAP - cam;
                s.group.visible = dz < FAR + 1;
                if (dz < -GAP || dz > FAR + 1) continue;
                const lod = dz < DETAIL ? "hi" : "lo";
                for (const side of [-1, 1]) TIERS.forEach((y, ti) => {
                    const v = Math.floor(hash(s.k, ti * 2 + side) * VARIETIES), across = v === YOUNG ? 4 : 3;
                    const mesh = lettuce![v][lod];
                    for (let row = 0; row < 2; row++) for (let j = 0; j < across; j++) {
                        const r = (n: number) => hash(s.k * 13 + ti * 5 + side * 3 + j * 1.7, row * 7.3 + n);
                        const x = side * (XI + XO) / 2 + ((j + 0.5) / across - 0.5) * 1.16 + (r(1) - 0.5) * 0.05;
                        const z = s.k * GAP + TRAY / 2 + (row - 0.5) * 0.38 + (r(2) - 0.5) * 0.05;
                        q.setFromAxisAngle(up, r(3) * Math.PI * 2);
                        const size = 1.02 + r(4) * 0.26;
                        m4.compose(v3.set(x, y, -z), q, sc.set(size, size * (0.92 + r(5) * 0.16), size));
                        const i = counts[v][lod]++;
                        mesh.setMatrixAt(i, m4);
                        const shade = 0.9 + r(6) * 0.15;
                        mesh.setColorAt(i, tint.setRGB(shade, shade, shade * 0.97));
                    }
                });
            }
            lettuce.forEach((pair, v) => {
                for (const lod of ["hi", "lo"] as const) {
                    const mesh = pair[lod];
                    mesh.count = counts[v][lod];
                    mesh.instanceMatrix.needsUpdate = true;
                    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
                }
            });
        };

        // ---- pollen floating up through the light, in front of everything
        const overlay = new THREE.Scene(), flatCam = new THREE.OrthographicCamera(0, 1, 0, -1, -1, 1);
        const pollenGeo = new THREE.CircleGeometry(1, 10), pollenMat = new THREE.MeshBasicMaterial({ color: 0x96c86e, transparent: true, opacity: 0.42, depthTest: false });
        const pollenMesh = new THREE.InstancedMesh(pollenGeo, pollenMat, 70);
        overlay.add(pollenMesh);
        disposables.push(pollenGeo, pollenMat);
        const pollen = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.8, v: 0.004 + Math.random() * 0.012 }));

        const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
        let w = 0, h = 0, vx = 0, vy = 0, raf = 0, last = performance.now(), cam = 0, boost = 0, seen = kick.current, slice = 0, gone = false;

        const size = () => {
            w = innerWidth; h = innerHeight; vx = w * 0.56; vy = h * 0.44;
            if (!w || !h) return;
            renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
            renderer.setSize(w, h);
            back.style.width = `${w + 120}px`; back.style.height = `${h}px`;
            paintBackdrop(back, w + 120, h, vx + 60, vy);
            // the focal length and off-centre vanishing point the painted farm always had
            const f = Math.min(h * 0.95, w * 1.2);
            camera.fov = (2 * Math.atan(h / 2 / f) * 180) / Math.PI;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            camera.projectionMatrix.elements[8] = -(vx - w / 2) / (w / 2);
            camera.projectionMatrix.elements[9] = -(h / 2 - vy) / (h / 2);
            camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
            flatCam.right = w; flatCam.bottom = -h;
            flatCam.updateProjectionMatrix();
        };
        const onMove = (e: PointerEvent) => { mouse.tx = e.clientX / w - 0.5; mouse.ty = e.clientY / h - 0.5; };

        const draw = () => {
            if (!w || !h) return;
            back.style.transform = `translateX(${-60 - mouse.x * 30}px)`;
            camera.position.set(mouse.x * 0.35, -mouse.y * 0.2, -cam);
            const now = Math.floor(cam / GAP);
            if (now !== slice) { // into the next slice: move the ones behind to the far end, and lay out the lettuce again
                slice = now;
                for (const s of slices) while ((s.k + 1) * GAP < cam - 0.3) place(s, s.k + SLICES);
                fillLettuce(cam);
            }
            pollen.forEach((p, i) => {
                m4.makeScale(p.r, p.r, 1).setPosition(p.x * w - mouse.x * 30 * p.r, -(p.y * h - mouse.y * 20 * p.r), 0);
                pollenMesh.setMatrixAt(i, m4);
            });
            pollenMesh.instanceMatrix.needsUpdate = true;
            renderer.clear();
            renderer.render(scene, camera);
            renderer.render(overlay, flatCam);
        };

        new GLTFLoader().load("/models/lettuce/lettuce.glb", (gltf) => {
            if (gone) return;
            const geos: Record<string, THREE.BufferGeometry> = {};
            gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) geos[o.name] = (o as THREE.Mesh).geometry; });
            lettuce = Array.from({ length: VARIETIES }, (_, v) => {
                const make = (lod: string) => {
                    const geo = geos[`v${v}_${lod}`];
                    const mesh = new THREE.InstancedMesh(geo, leafMat, CAP);
                    mesh.frustumCulled = false; // the instances span the whole aisle
                    mesh.count = 0;
                    scene.add(mesh);
                    disposables.push(geo, mesh);
                    return mesh;
                };
                return { hi: make("hi"), lo: make("lo") };
            });
            fillLettuce(cam);
            if (still) draw();
        });

        const frame = (now: number) => {
            raf = requestAnimationFrame(frame);
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            if (kick.current !== seen) { seen = kick.current; boost = 9; }
            boost *= 0.95 ** (dt * 60);
            cam += dt * 0.45 * (1 + boost);
            for (const p of pollen) { p.y -= p.v * dt * (1 + boost * 0.3); if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); } }
            const follow = Math.min(1, dt * 2.5);
            mouse.x += (mouse.tx - mouse.x) * follow; mouse.y += (mouse.ty - mouse.y) * follow;
            draw();
        };

        const onResize = () => { size(); if (still) draw(); };
        size();
        addEventListener("resize", onResize);
        if (still) draw();
        else { addEventListener("pointermove", onMove); raf = requestAnimationFrame(frame); }
        return () => {
            gone = true;
            cancelAnimationFrame(raf);
            removeEventListener("resize", onResize);
            removeEventListener("pointermove", onMove);
            for (const d of disposables) d.dispose();
            renderer.dispose();
        };
    }, [kick]);

    return (
        <div className="farm" aria-hidden>
            <canvas ref={backRef} />
            <canvas ref={glRef} />
        </div>
    );
}
