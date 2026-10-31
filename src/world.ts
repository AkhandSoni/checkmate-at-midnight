import * as THREE from "three";
import { assetUrl } from "./assets";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { layout, story, type Settings } from "./engine";
export type Target = {
  id: string;
  label: string;
  kind: "suspect" | "clue" | "body" | "scenery";
  x: number;
  z: number;
  y: number;
  room: string;
  mesh?: THREE.Object3D;
};
export type Rect = { x: number; z: number; w: number; d: number; id: string };
type WallFade = {
  group: THREE.Group;
  bounds: THREE.Box3;
  materials: THREE.Material[];
  opacity: number;
};
const mat = (color: string, roughness = 0.8, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });
const stone = mat("#959895"),
  wall = mat("#D2D2CF"),
  dark = mat("#565A59"),
  coal = mat("#292D30"),
  brass = mat("#9A8052", 0.45, 0.65);
const boxGeo = new THREE.BoxGeometry(1, 1, 1),
  roundGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.025);
export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera();
  readonly actors = new Map<string, THREE.Group>();
  readonly targets: Target[] = [];
  readonly colliders: Rect[] = [];
  readonly walls: { group: THREE.Group; axis: "x" | "z"; value: number }[] = [];
  readonly keys = new Set<string>();
  readonly touchMove = new THREE.Vector2();
  readonly player = new THREE.Group();
  readonly lean = new THREE.Group();
  readonly focus = new THREE.Vector3(12, 0, 4);
  readonly position = new THREE.Vector3(3, 0, 2);
  readonly velocity = new THREE.Vector3();
  readonly follow = new THREE.Vector3(3, 0, 2);
  room = "entrance";
  modal = true;
  ready = false;
  nearest: Target | null = null;
  onRoom = (_: string) => {};
  onMove = () => {};
  onNear = (_: Target | null) => {};
  settings: Settings;
  cameraMode: "follow" | "room" | "actor" | "ending" = "room";
  cameraHeight = 12;
  cameraTarget = new THREE.Vector3(12, 0, 4);
  endingClock = 0;
  endingShot = 0;
  private gates: THREE.Object3D[] = [];
  endingId = "";
  endingCast: THREE.Object3D[] = [];
  frames: number[] = [];
  last = 0;
  walkSound = 0;
  private ring: THREE.Mesh;
  private shadow: THREE.Texture;
  private light: THREE.DirectionalLight;
  private loader = new GLTFLoader();
  private modelCache = new Map<string, THREE.Group>();
  private floorPlanPreview = "";
  private archCanopies: THREE.Group[] = [];
  private wallFades: WallFade[] = [];
  constructor(canvas: HTMLCanvasElement, settings: Settings) {
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      Math.min(
        devicePixelRatio,
        matchMedia("(pointer: coarse)").matches ? 1.25 : 1.5,
      ),
    );
    this.renderer.setClearColor("#1d2224");
    this.renderer.shadowMap.enabled = settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.scene.add(new THREE.HemisphereLight("#f0eee6", "#858b8e", 2.7));
    this.light = new THREE.DirectionalLight("#fff0d9", 3.0);
    this.light.position.set(5, 18, 5);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(2048, 2048);
    this.light.shadow.camera.left = -17;
    this.light.shadow.camera.right = 17;
    this.light.shadow.camera.top = 14;
    this.light.shadow.camera.bottom = -14;
    this.light.shadow.normalBias = 0.035;
    this.light.shadow.bias = -0.00008;
    this.light.target.position.set(12, 0, 8);
    this.light.position.set(2, 20, 4);
    this.scene.add(this.light, this.light.target);
    const fill = new THREE.DirectionalLight("#cbd3d7", 0.7);
    fill.position.set(20, 10, -15);
    this.scene.add(fill);
    this.shadow = this.shadowTexture();
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.48, 0.51, 48),
      new THREE.MeshBasicMaterial({
        color: "#d4bd83",
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.035;
    this.ring.visible = false;
    this.scene.add(this.ring);
    this.player.add(this.lean);
    this.scene.add(this.player);
    this.architecture();
    this.prepareWallFades();
    this.interactions();
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("blur", () => this.clearKeys());
    this.resize();
  }
  private mesh(
    g: THREE.BufferGeometry,
    m: THREE.Material,
    pos: THREE.Vector3 | number[],
    scale?: number[],
    parent: THREE.Object3D = this.scene,
  ) {
    const o = new THREE.Mesh(g, m);
    o.position.copy(
      pos instanceof THREE.Vector3 ? pos : new THREE.Vector3(...pos),
    );
    if (scale) o.scale.set(...(scale as [number, number, number]));
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  private cube(
    pos: number[],
    scale: number[],
    m: THREE.Material = stone,
    parent?: THREE.Object3D,
    rounded = false,
  ) {
    return this.mesh(rounded ? roundGeo : boxGeo, m, pos, scale, parent);
  }
  private shadowTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const cx = c.getContext("2d")!;
    const g = cx.createRadialGradient(64, 64, 10, 64, 64, 64);
    g.addColorStop(0, "rgba(0,0,0,.38)");
    g.addColorStop(0.4, "rgba(0,0,0,.24)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    cx.fillStyle = g;
    cx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }
  private contact(parent: THREE.Object3D, size = 1.4) {
    const o = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({
        map: this.shadow,
        transparent: true,
        depthWrite: false,
      }),
    );
    o.rotation.x = -Math.PI / 2;
    o.position.y = 0.012;
    parent.add(o);
  }
  private floorTexture(base: string) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d")!;
    x.fillStyle = base;
    x.fillRect(0, 0, 128, 128);
    let seed = 22;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 380; i++) {
      x.strokeStyle = `rgba(130,135,133,${rand() * 0.012})`;
      x.lineWidth = rand() * 0.8;
      x.beginPath();
      const y = rand() * 128;
      x.moveTo(0, y);
      x.bezierCurveTo(
        40,
        y + rand() * 40,
        70,
        y - rand() * 25,
        128,
        y + rand() * 25,
      );
      x.stroke();
    }
    return new THREE.CanvasTexture(c);
  }
  private architecture() {
    const floorMaterials = [mat("#dad9d1", 0.73), mat("#303638", 0.75)];
    floorMaterials[0].map = this.floorTexture("#dad9d1");
    floorMaterials[1].map = this.floorTexture("#303638");
    floorMaterials.forEach((m) => m.color.set("#ffffff"));
    const tile = new THREE.BoxGeometry(0.991, 0.07, 0.991);
    const dummy = new THREE.Object3D();
    for (let k = 0; k < 2; k++) {
      const tiles = new THREE.InstancedMesh(tile, floorMaterials[k], 192);
      let i = 0;
      for (let x = 0; x < 24; x++)
        for (let z = 0; z < 16; z++)
          if ((x + z) % 2 === k) {
            dummy.position.set(x + 0.5, -0.045, z + 0.5);
            dummy.updateMatrix();
            tiles.setMatrixAt(i++, dummy.matrix);
          }
      tiles.receiveShadow = true;
      this.scene.add(tiles);
    }
    this.cube([12, -0.3, 8], [24.35, 0.5, 16.35], dark, undefined, true);
    // Exact 6-vertex/7-edge topology. Shared boundary walls are created once, with a real gap and collider gap.
    const spans: [number, number, number, "x" | "z", number[]][] = [
      [0, 0, 16, "x", []],
      [24, 0, 16, "x", []],
      [0, 0, 24, "z", [4]],
      [16, 0, 24, "z", []],
      [8, 0, 16, "x", [4, 12]],
      [16, 0, 16, "x", [4, 12]],
      [8, 0, 24, "z", [4, 12, 20]],
    ];
    for (const [v, start, end, axis, doors] of spans) {
      let a = start;
      for (const d of [...doors, end + 2]) {
        // The jamb occupies 0.9..1.1m from the door centre. Stop plaster
        // beyond its outer face so the two solid meshes never share a face.
        const b = d - 1.105;
        if (b > a) this.wallSegment(axis, v, a, Math.min(b, end));
        a = d + 1.105;
      }
      for (const d of doors) this.arch(axis, v, d);
    }
    // Pillars/cornices establish the stone scale; visual fading never changes collisions.
    for (const x of [0, 8, 16, 24])
      for (const z of [0, 8, 16]) {
        const g = new THREE.Group();
        this.scene.add(g);
        this.cube([x, 1.48, z], [0.34, 2.96, 0.34], stone, g, true);
        this.cube([x, 2.88, z], [0.46, 0.18, 0.46], wall, g, true);
        this.cube([x, 0.12, z], [0.47, 0.24, 0.47], dark, undefined, true);
        this.walls.push({ group: g, axis: "x", value: x });
      }
    for (const r of layout.rooms) {
      const [ox, oz] = r.origin;
      this.window(ox + (r.id === "entrance" ? 2.5 : 6.5), oz + 0.13);
      for (const x of [ox + 1.0, ox + 6.95]) this.sconce(x, oz + 0.3);
    }
    // Batch static architecture by material; walls keep their own fadeable groups.
    const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const remove: THREE.Mesh[] = [];
    for (const o of this.scene.children) {
      if (
        o instanceof THREE.Mesh &&
        o !== this.ring &&
        !(o instanceof THREE.InstancedMesh)
      ) {
        o.updateMatrix();
        const g = (
          o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()
        ).applyMatrix4(o.matrix);
        const m = o.material as THREE.Material;
        buckets.set(m, [...(buckets.get(m) || []), g]);
        remove.push(o);
      }
    }
    for (const [m, gs] of buckets) {
      const g = mergeGeometries(gs, false);
      if (g) this.mesh(g, m, [0, 0, 0]);
      for (const item of gs) item.dispose();
    }
    for (const o of remove) this.scene.remove(o);
  }
  private wallSegment(axis: "x" | "z", v: number, a: number, b: number) {
    const centre = (a + b) / 2,
      len = b - a;
    if (len < 0.01) return;
    const vertical = axis === "x";
    const p = vertical ? [v, 0, centre] : [centre, 0, v];
    this.colliders.push({
      id: "wall",
      x: p[0],
      z: p[2],
      w: vertical ? 0.22 : len,
      d: vertical ? len : 0.22,
    });
    this.cube(
      [p[0], 0.18, p[2]],
      vertical ? [0.25, 0.36, len] : [len, 0.36, 0.25],
      dark,
    );
    const g = new THREE.Group();
    this.scene.add(g);
    this.cube(
      [p[0], 1.66, p[2]],
      vertical ? [0.22, 2.6, len] : [len, 2.6, 0.22],
      wall,
      g,
    );
    for (const y of [0.43, 2.78, 2.98])
      this.cube(
        [p[0], y, p[2]],
        vertical ? [0.3, 0.095, len] : [len, 0.095, 0.3],
        stone,
        g,
        true,
      );
    this.walls.push({ group: g, axis, value: v });
  }
  private prepareWallFades() {
    for (const { group } of this.walls) {
      // Architecture shares stone materials with other objects. Clone once per
      // wall so fading it cannot change furniture or a neighbouring wall.
      const copies = new Map<THREE.Material, THREE.Material>();
      group.traverse((part) => {
        if (!(part instanceof THREE.Mesh)) return;
        const copy = (source: THREE.Material) => {
          let material = copies.get(source);
          if (!material) {
            material = source.clone();
            material.transparent = true;
            copies.set(source, material);
          }
          return material;
        };
        part.material = Array.isArray(part.material)
          ? part.material.map(copy)
          : copy(part.material);
      });
      this.wallFades.push({
        group,
        bounds: new THREE.Box3().setFromObject(group),
        materials: [...copies.values()],
        opacity: 1,
      });
    }
  }

  private updateWallFades(cameraOffset: THREE.Vector3, dt: number) {
    const subject = this.cameraMode === "follow" ? this.position : this.focus;
    const direction = cameraOffset.clone().normalize();
    const right = new THREE.Vector3(direction.z, 0, -direction.x).normalize();
    const points: THREE.Vector3[] = [];
    // Sample the base, coat and head across the silhouette. Orthographic view
    // rays are parallel, so each ray points in the same camera direction.
    for (const height of [0.35, 1.3, 2.3])
      for (const side of [-0.42, 0, 0.42])
        points.push(
          subject
            .clone()
            .addScaledVector(right, side)
            .add(new THREE.Vector3(0, height, 0)),
        );
    if (this.nearest)
      points.push(
        new THREE.Vector3(this.nearest.x, this.nearest.y, this.nearest.z),
      );
    const ray = new THREE.Ray(),
      hit = new THREE.Vector3();
    for (const wall of this.wallFades) {
      wall.group.visible = true;
      const blocked = points.some((point) => {
        ray.set(point, direction);
        return ray.intersectBox(wall.bounds, hit) !== null;
      });
      const target = blocked ? 0.5 : 1;
      wall.opacity = this.settings.reducedMotion
        ? target
        : THREE.MathUtils.damp(wall.opacity, target, 10, dt);
      if (Math.abs(wall.opacity - target) < 0.001) wall.opacity = target;
      for (const material of wall.materials) {
        material.opacity = wall.opacity;
        // Transparent stone must not prevent actors behind it from drawing.
        material.depthWrite = wall.opacity === 1;
      }
    }
  }
  private arch(axis: "x" | "z", v: number, c: number) {
    // Masonry voussoirs form a pointed medieval arch above a 1.8m-wide clear opening.
    const g = new THREE.Group();
    this.scene.add(g);
    const point = (u: number, y: number): number[] =>
      axis === "x" ? [v, y, c + u] : [c + u, y, v];
    for (const side of [-1, 1]) {
      const post = point(side, 0);
      this.colliders.push({
        id: "door jamb",
        x: post[0],
        z: post[2],
        w: axis === "x" ? 0.36 : 0.2,
        d: axis === "x" ? 0.2 : 0.36,
      });
      this.cube(
        point(side * 1.0, 1.14),
        axis === "x" ? [0.36, 2.28, 0.2] : [0.2, 2.28, 0.36],
        stone,
        g,
        true,
      );
      this.cube(
        point(side * 1.0, 2.1),
        axis === "x" ? [0.43, 0.14, 0.3] : [0.3, 0.14, 0.43],
        wall,
        g,
        true,
      );
    }
    // The overhead plan omits the overhead stones so open doorways stay visible.
    const canopy = new THREE.Group();
    g.add(canopy);
    this.archCanopies.push(canopy);
    for (let j = 0; j < 12; j++) {
      const t = j / 12,
        u = -0.9 + t * 1.8,
        un = -0.9 + ((j + 1) / 12) * 1.8;
      const h = (x: number) =>
        2.1 + 0.72 * (1 - Math.pow(Math.abs(x / 0.9), 1.35));
      const h1 = h(u),
        h2 = h(un);
      const verts =
        axis === "z"
          ? [
              u,
              h1,
              -0.16,
              un,
              h2,
              -0.16,
              un,
              h2 + 0.23,
              -0.16,
              u,
              h1 + 0.23,
              -0.16,
              u,
              h1,
              0.16,
              un,
              h2,
              0.16,
              un,
              h2 + 0.23,
              0.16,
              u,
              h1 + 0.23,
              0.16,
            ]
          : [
              -0.16,
              h1,
              u,
              -0.16,
              h2,
              un,
              -0.16,
              h2 + 0.23,
              un,
              -0.16,
              h1 + 0.23,
              u,
              0.16,
              h1,
              u,
              0.16,
              h2,
              un,
              0.16,
              h2 + 0.23,
              un,
              0.16,
              h1 + 0.23,
              u,
            ];
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      geo.setIndex([
        0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6,
        0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
      ]);
      geo.computeVertexNormals();
      this.mesh(
        geo,
        j % 2 ? stone : wall,
        axis === "z" ? [c, 0, v] : [v, 0, c],
        undefined,
        canopy,
      );
    }
    this.walls.push({ group: g, axis, value: v });
    // Threshold and small inset brass studs, no traversability changes.
    this.cube(
      point(0, 0.012),
      axis === "x" ? [0.45, 0.025, 1.8] : [1.8, 0.025, 0.45],
      stone,
    );
  }
  /** A cached photograph of the real furnished scene, viewed straight down.
   * Rendering offscreen leaves the play camera, collision and wall fading intact.
   * The UI draws the live player marker separately from this static image.
   */
  captureFloorPlan(): string {
    if (this.floorPlanPreview) return this.floorPlanPreview;
    const width = 1200,
      height = 816;
    const target = new THREE.WebGLRenderTarget(width, height, { samples: 4 });
    target.texture.colorSpace = THREE.SRGBColorSpace;
    const camera = new THREE.OrthographicCamera(
      -12.5,
      12.5,
      8.5,
      -8.5,
      0.1,
      100,
    );
    camera.position.set(12, 40, 8);
    camera.up.set(0, 0, -1);
    camera.lookAt(12, 0, 8);
    const previousTarget = this.renderer.getRenderTarget();
    const clearColor = this.renderer.getClearColor(new THREE.Color());
    const clearAlpha = this.renderer.getClearAlpha();
    const wallMaterials = this.wallFades.flatMap((wall) =>
      wall.materials.map((material) => ({
        material,
        opacity: material.opacity,
        depthWrite: material.depthWrite,
      })),
    );
    const visibility = [
      ...this.walls.map((w) => w.group),
      ...this.archCanopies,
      this.player,
      this.ring,
    ].map((object) => ({ object, visible: object.visible }));
    try {
      this.walls.forEach((w) => {
        w.group.visible = true;
      });
      wallMaterials.forEach(({ material }) => {
        material.opacity = 1;
        material.depthWrite = true;
      });
      this.archCanopies.forEach((canopy) => {
        canopy.visible = false;
      });
      this.player.visible = false;
      this.ring.visible = false;
      this.renderer.setClearColor("#f7f1e4", 0);
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.scene, camera);
      const pixels = new Uint8Array(width * height * 4);
      this.renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d")!;
      const image = context.createImageData(width, height);
      // WebGL starts at the lower left; canvas image rows start at the top.
      const stride = width * 4;
      for (let row = 0; row < height; row++)
        image.data.set(
          pixels.subarray((height - row - 1) * stride, (height - row) * stride),
          row * stride,
        );
      context.putImageData(image, 0, 0);
      this.floorPlanPreview = canvas.toDataURL("image/png");
      return this.floorPlanPreview;
    } finally {
      visibility.forEach(({ object, visible }) => {
        object.visible = visible;
      });
      wallMaterials.forEach(({ material, opacity, depthWrite }) => {
        material.opacity = opacity;
        material.depthWrite = depthWrite;
      });
      this.renderer.setRenderTarget(previousTarget);
      this.renderer.setClearColor(clearColor, clearAlpha);
      target.dispose();
    }
  }

  private window(x: number, z: number) {
    // Thin decorative lancet sitting in stone framing, lead lattice is real geometry.
    const back = mat("#718183", 0.9);
    const g = new THREE.Group();
    this.scene.add(g);
    this.cube([x, 1.93, z - 0.03], [0.73, 1.55, 0.06], back, g, true);
    for (const side of [-1, 1])
      this.cube(
        [x + side * 0.43, 1.93, z + 0.04],
        [0.12, 1.82, 0.21],
        stone,
        g,
        true,
      );
    for (const y of [1.09, 2.78])
      this.cube([x, y, z + 0.04], [0.98, 0.12, 0.26], wall, g, true);
    for (let i = -3; i < 4; i++)
      for (const s of [-1, 1]) {
        const a = new THREE.Vector3(x - 0.32, 1.2 + i * 0.23, z + 0.04),
          b = new THREE.Vector3(x + 0.32, 1.2 + i * 0.23 + s * 0.61, z + 0.04);
        if (Math.min(a.y, b.y) < 1.13 || Math.max(a.y, b.y) > 2.7) continue;
        const line = new THREE.Mesh(
          new THREE.CylinderGeometry(0.009, 0.009, a.distanceTo(b), 6),
          coal,
        );
        line.position.copy(a.clone().add(b).multiplyScalar(0.5));
        line.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          b.sub(a).normalize(),
        );
        g.add(line);
      }
    this.walls.push({ group: g, axis: "z", value: z });
  }
  private sconce(x: number, z: number) {
    const g = new THREE.Group();
    this.scene.add(g);
    this.cube([x, 1.85, z], [0.16, 0.32, 0.06], coal, g, true);
    this.cube([x, 1.75, z + 0.16], [0.055, 0.055, 0.3], coal, g, true);
    this.mesh(
      new THREE.CylinderGeometry(0.043, 0.05, 0.28, 10),
      mat("#bdb4a1"),
      [x, 1.98, z + 0.26],
      undefined,
      g,
    );
    this.mesh(
      new THREE.SphereGeometry(0.03, 8, 6),
      new THREE.MeshBasicMaterial({ color: "#ffcf8c" }),
      [x, 2.145, z + 0.26],
      [1, 1.8, 1],
      g,
    );
    this.walls.push({ group: g, axis: "z", value: z });
  }
  async load(benchmark = false, onProgress = (_: number) => {}) {
    const names = benchmark
      ? ["CHR_knight", "CHR_scarlet", "ROOM_study"]
      : [
          "CHR_knight",
          "CHR_scarlet",
          "CHR_king",
          "CHR_king_fallen",
          "PROP_coronet",
          "PROP_bishop_token",
          "PROP_open_letter",
          "CHR_ash",
          "CHR_voss",
          "CHR_flint",
          "CHR_mara",
          ...layout.rooms.map((r) => "ROOM_" + r.id),
        ];
    let done = 0;
    await Promise.all(
      names.map(async (n) => {
        const gltf = await this.loader.loadAsync(
          assetUrl("models/" + n + ".glb"),
        );
        const g = gltf.scene;
        g.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        this.modelCache.set(n, g);
        onProgress(++done / names.length);
      }),
    );
    this.lean.add(this.modelCache.get("CHR_knight")!.clone(true));
    this.contact(this.player, 1.1);
    this.player.position.copy(this.position);
    for (const r of layout.rooms) {
      const room = this.modelCache.get("ROOM_" + r.id);
      if (room) {
        room.position.set(r.origin[0] + 4, 0, r.origin[1] + 4);
        this.scene.add(room);
        room.traverse((part) => {
          if (part.name.includes("__doors")) this.gates.push(part);
        });
        this.furnitureCollisions(r.id, r.origin[0] + 4, r.origin[1] + 4);
      }
    }
    for (const [id, pos] of Object.entries(layout.suspectPositions)) {
      const asset = this.modelCache.get("CHR_" + id);
      if (!asset) continue;
      const g = asset.clone(true);
      g.position.set(pos[0], 0, pos[1]);
      g.rotation.y = -0.55;
      this.scene.add(g);
      this.contact(g);
      this.actors.set(id, g);
      const width = id === "scarlet" ? 1.1 : id === "ash" ? 0.8 : 0.95;
      this.colliders.push({ id, x: pos[0], z: pos[1], w: width, d: width });
    }
    const king = this.modelCache.get("CHR_king_fallen");
    if (king) {
      const g = new THREE.Group();
      const fallen = king.clone(true);
      fallen.position.x = -0.3;
      g.add(fallen);
      g.position.set(
        ...([layout.king[0], 0, layout.king[1]] as [number, number, number]),
      );
      g.rotation.y = -0.5;
      this.contact(g, 2.3);
      this.scene.add(g);
      this.actors.set("king", g);
      this.colliders.push({
        id: "fallen King",
        x: 11.8,
        z: 3.95,
        w: 1.8,
        d: 0.65,
      });
    }
    // Warm fireplace bounce, no shadow-casting point lights.
    for (const p of [
      [20, 1.5, 0.7],
      [0.8, 1.4, 13.5],
    ]) {
      const l = new THREE.PointLight("#ffbc72", 2.2, 5, 2);
      l.position.set(...(p as [number, number, number]));
      this.scene.add(l);
    }
    this.ready = true;
  }
  /** Return an independent scene clone for portraits/viewers, never the live actor. */
  cloneModelAsset(name: string): THREE.Group {
    const model = this.modelCache.get(name);
    if (!model) throw new Error("Unknown model: " + name);
    return model.clone(true);
  }

  private furnitureCollisions(id: string, x: number, z: number) {
    const add = (a: number, b: number, w: number, d: number, n = "furniture") =>
      this.colliders.push({ x: x + a, z: z + b, w, d, id: n });
    if (id === "study") {
      add(0.2, -1.55, 3.2, 1.35, "desk");
      add(0.3, -2.75, 0.72, 0.7);
      add(0.7, 0.8, 0.9, 0.75, "ledger table");
      add(-2.7, 2.6, 0.75, 0.75);
      add(-2.4, -3.57, 1.8, 0.7);
      add(2.8, -2.3, 1.65, 0.35);
    }
    if (id === "drawing") {
      add(0, -3.4, 2.6, 1.1);
      add(-1.3, -0.6, 0.8, 0.9);
      add(1.4, -0.6, 0.8, 0.9);
      add(0.75, -1.15, 0.85, 0.85);
      add(-1.6, 1.3, 0.8, 0.85, "damaged chair");
      add(-2.85, -2.25, 0.85, 0.7);
    }
    if (id === "library") {
      add(-2.45, -3.5, 2.4, 0.8);
      add(2.45, -3.5, 2.4, 0.8);
      add(-3.5, 1.5, 1, 2.0);
      add(1.3, 0.7, 1.7, 1, "document case");
      add(-1.3, 1.0, 0.7, 0.65, "burned accounts");
      add(1.8, -0.35, 0.7, 0.7);
    }
    if (id === "dining") {
      add(-0.4, -1.05, 3.4, 1.4, "dining table");
      for (const [a, b, w, d] of [
        [-1.5, 0.02, 0.7, 0.65],
        [0.1, 0.02, 0.7, 0.65],
        [-1.5, -2.12, 0.7, 0.65],
        [0.5, -2.12, 0.7, 0.65],
        [-2.55, -1.05, 0.65, 0.7],
      ])
        add(a, b, w, d);
      add(1.4, 0.8, 0.8, 0.7, "will table");
      add(2.45, -3.5, 2.1, 0.8);
    }
    if (id === "servants") {
      add(2.65, -0.65, 1.2, 2.3, "bed");
      add(-1.5, -3.5, 1.5, 0.8);
      add(-1.7, 1, 0.9, 0.75);
      add(2.6, -2.75, 0.9, 0.75);
      add(1.65, -3.5, 0.85, 0.72);
      add(-2.7, -3.5, 0.65, 0.6);
      add(3.1, 2.7, 0.5, 0.5);
    }
    if (id === "entrance") {
      add(-2.6, -3.4, 0.9, 0.7);
      add(2.0, 1.2, 0.65, 0.65, "duty book");
    }
  }
  private interactions() {
    for (const s of story.suspects) {
      const p =
        layout.suspectPositions[s.id as keyof typeof layout.suspectPositions];
      this.targets.push({
        id: s.id,
        label: s.name,
        kind: "suspect",
        room: s.room,
        x: p[0],
        z: p[1],
        y: 1.5,
      });
    }
    for (const c of story.clues) {
      const r = layout.rooms.find((r) => r.id === c.room)!;
      this.targets.push({
        id: c.id,
        label:
          (
            {
              poison_flask: "Document case",
              burned_accounts: "Scorched parchment",
            } as Record<string, string>
          )[c.id] || story.evidence[c.id as keyof typeof story.evidence].title,
        kind: "clue",
        room: c.room,
        x: r.origin[0] + 4 + c.localXZ[0],
        z: r.origin[1] + 4 + c.localXZ[1],
        y: 0.65,
      });
    }
    this.targets.push({
      id: "king",
      label: "The fallen King",
      kind: "body",
      room: "study",
      x: layout.king[0],
      z: layout.king[1],
      y: 0.5,
    });
    const scenic: [string, string, string, number, number, number][] = [
      ["clock", "Grand clock", "entrance", 1.4, 0.6, 1.5],
      ["mule", "Mounted mule", "entrance", 5.9, 0.6, 2],
      ["gates", "Locked entrance", "entrance", 4, 0.6, 1],
      ["chessboard", "Unfinished chess game", "study", 11.6, 2.4, 1],
      ["screen", "Folding screen", "study", 14.7, 1.8, 1],
      ["medicine", "Medicine cupboard", "servants", 18.5, 8.7, 1.3],
    ];
    for (const [id, label, room, x, z, y] of scenic)
      this.targets.push({ id, label, kind: "scenery", room, x, z, y });
  }
  resize() {
    const w = innerWidth,
      h = innerHeight;
    if (this.cameraMode === "follow")
      this.cameraHeight = matchMedia(
        "(pointer: coarse) and (orientation: landscape)",
      ).matches
        ? 9.8
        : 11.6;
    this.renderer.setSize(w, h);
    const a = w / h;
    this.camera.left = (-this.cameraHeight * a) / 2;
    this.camera.right = (this.cameraHeight * a) / 2;
    this.camera.top = this.cameraHeight / 2;
    this.camera.bottom = -this.cameraHeight / 2;
    this.camera.near = 0.1;
    this.camera.far = 150;
    this.camera.updateProjectionMatrix();
  }
  setSettings(s: Settings) {
    this.settings = s;
    this.renderer.shadowMap.enabled = s.shadows;
  }
  clearKeys() {
    this.keys.clear();
    this.touchMove.set(0, 0);
    this.velocity.set(0, 0, 0);
  }
  blocked(x: number, z: number) {
    const r = 0.32;
    if (x < r + 0.05 || z < r + 0.05 || x > 24 - r - 0.05 || z > 16 - r - 0.05)
      return true;
    return this.colliders.some((c) => {
      const dx = Math.max(Math.abs(x - c.x) - c.w / 2, 0),
        dz = Math.max(Math.abs(z - c.z) - c.d / 2, 0);
      return dx * dx + dz * dz < r * r;
    });
  }
  safePosition(x: number, z: number) {
    if (!this.blocked(x, z)) return [x, z] as const;
    for (let r = 0.15; r < 2; r += 0.15)
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const xx = x + Math.cos(a) * r,
          zz = z + Math.sin(a) * r;
        if (!this.blocked(xx, zz)) return [xx, zz] as const;
      }
    return [3, 2] as const;
  }
  teleport(x: number, z: number) {
    const [a, b] = this.safePosition(x, z);
    this.position.set(a, 0, b);
    this.follow.copy(this.position);
    this.player.position.copy(this.position);
    this.clearKeys();
    this.checkRoom();
  }
  focusRoom(id: string) {
    const r = layout.rooms.find((x) => x.id === id)!;
    this.cameraMode = "room";
    this.cameraHeight = 10.5;
    this.cameraTarget.set(r.origin[0] + 4, 0, r.origin[1] + 4);
    this.resize();
  }
  photoActor(id: string) {
    const actor = id === "knight" ? this.player : this.actors.get(id);
    if (!actor) return;
    this.cameraMode = "actor";
    this.cameraHeight = 3.6;
    this.cameraTarget.copy(actor.position).add(new THREE.Vector3(0, 0.85, 0));
    this.resize();
  }
  followPlayer() {
    this.cameraMode = "follow";
    this.cameraHeight = 11.6;
    this.resize();
  }
  private checkRoom() {
    const r = layout.rooms.find(
      (r) =>
        this.position.x >= r.bounds[0] &&
        this.position.x < r.bounds[2] &&
        this.position.z >= r.bounds[1] &&
        this.position.z < r.bounds[3],
    );
    if (r && r.id !== this.room) {
      this.room = r.id;
      this.onRoom(this.room);
    }
  }
  nearestTarget() {
    let near: Target | null = null;
    let best = Infinity;
    for (const t of this.targets) {
      if (t.room !== this.room) continue;
      const d = Math.hypot(t.x - this.position.x, t.z - this.position.z);
      if (d < 1.65 && d < best) {
        best = d;
        near = t;
      }
    }
    return near;
  }
  screenPosition(x: number, y: number, z: number) {
    const p = new THREE.Vector3(x, y, z).project(this.camera);
    return {
      x: ((p.x + 1) * innerWidth) / 2,
      y: ((1 - p.y) * innerHeight) / 2,
    };
  }
  resetCast() {
    for (const object of this.endingCast) {
      this.scene.remove(object);
      if (object.userData.temporaryGeometry)
        object.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            const materials = Array.isArray(child.material)
              ? child.material
              : [child.material];
            materials.forEach((material) => material.dispose());
          }
        });
    }
    this.endingCast = [];
    for (const gate of this.gates) gate.visible = true;
    for (const [id, actor] of this.actors) {
      if (id === "king") continue;
      const position =
        layout.suspectPositions[id as keyof typeof layout.suspectPositions];
      actor.position.set(position[0], 0, position[1]);
      actor.visible = true;
      actor.rotation.y = -0.55;
      actor.traverse((part) => {
        if (part.name.includes("__coronet") || part.name.includes("__keys"))
          part.visible = true;
      });
    }
    this.player.visible = true;
    this.endingId = "";
    this.endingShot = 0;
  }

  private moveActor(id: string, x: number, z: number) {
    this.actors.get(id)?.position.set(x, 0, z);
  }

  private endingProp(
    asset: string,
    name: string,
    position: number[],
    scale = 1,
  ) {
    const prop = this.modelCache.get(asset)!.clone(true);
    prop.name = name;
    prop.position.set(...(position as [number, number, number]));
    prop.scale.setScalar(scale);
    this.scene.add(prop);
    this.endingCast.push(prop);
    return prop;
  }

  stageEnding(id: string) {
    this.resetCast();
    this.endingId = id;
    this.endingClock = 0;
    this.cameraMode = "ending";
    this.player.visible = false;

    if (id === "checkmate") {
      this.moveActor("scarlet", 14.2, 5.5);
      this.moveActor("ash", 13.1, 6.0);
      this.moveActor("mara", 10, 5.8);
      this.moveActor("voss", 12.0, 5.6);
      this.moveActor("flint", 12.9, 4.9);
      this.endingProp("CHR_knight", "Ending detective", [10.9, 0, 5.1]);
      this.endingProp(
        "CHR_knight",
        "Miniature knight",
        [11.23, 1.03, 2.4],
        0.09,
      );
      this.endingProp(
        "PROP_bishop_token",
        "Miniature bishop",
        [11.67, 1.03, 2.4],
        0.28,
      );
    } else if (id === "scarlet") {
      this.moveActor("scarlet", 4.2, 2.2);
      this.moveActor("flint", 5.25, 2.4);
      this.moveActor("voss", 1.5, 13.5);
      this.gates.forEach((gate) => (gate.visible = false));
    } else if (id === "ash") {
      this.moveActor("ash", 13.5, 13.5);
      this.moveActor("flint", 14.5, 13.9);
      this.actors.get("ash")!.traverse((part) => {
        if (part.name.includes("__coronet")) part.visible = false;
      });
      this.endingProp("PROP_coronet", "Abandoned coronet", [12.35, 0.94, 10.8]);
    } else if (id === "mara") {
      this.moveActor("mara", 21.3, 13.5);
      this.moveActor("flint", 22.4, 13.6);
      this.moveActor("voss", 20, 9.5);
      this.actors.get("mara")!.traverse((part) => {
        if (part.name.includes("__keys")) part.visible = false;
      });
    } else if (id === "voss_free") {
      this.moveActor("voss", 4.2, 2.0);
      this.moveActor("flint", 6, 3.6);
      this.gates.forEach((gate) => (gate.visible = false));
      this.endingProp(
        "PROP_open_letter",
        "Opened parcel",
        [5.9, 0.82, 5.3],
        0.8,
      );
      this.endingProp(
        "PROP_bishop_token",
        "The black bishop",
        [5.8, 0.85, 5.3],
        0.7,
      );
    } else if (id === "fire") {
      ["scarlet", "ash", "mara", "flint"].forEach((who, i) =>
        this.moveActor(who, 2.5 + i * 1.0, 2.2 + (i % 2) * 1.1),
      );
      this.moveActor("voss", 1.5, 13.4);
      this.gates.forEach((gate) => (gate.visible = false));
      const smoke = new THREE.Group();
      smoke.name = "Library smoke";
      smoke.userData.temporaryGeometry = true;
      for (let i = 0; i < 9; i++) {
        const puff = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.4 + i * 0.035, 1),
          new THREE.MeshStandardMaterial({
            color: "#545857",
            transparent: true,
            opacity: 0.17,
            depthWrite: false,
          }),
        );
        puff.position.set(
          0.8 + (i % 3) * 0.45,
          1.3 + i * 0.2,
          13.1 + (i % 2) * 0.3,
        );
        smoke.add(puff);
      }
      this.scene.add(smoke);
      this.endingCast.push(smoke);
      const firelight = new THREE.PointLight("#ff8e3d", 9, 12);
      firelight.position.set(1.0, 1.5, 13.5);
      this.scene.add(firelight);
      this.endingCast.push(firelight);
    }
    this.setEndingShot(0);
  }

  get endingSceneLabel() {
    const labels: Record<string, string[]> = {
      scarlet: [
        "The Scarlet Verdict · At the gates",
        "At dawn · The accounts burn",
        "The overlooked thread",
      ],
      ash: [
        "The Fallen Heir · Arrest",
        "The abandoned coronet",
        "The overlooked goblet",
      ],
      mara: [
        "The Disposable Pawn · Arrest",
        "Keys left on white linen",
        "A bishop in the doorway",
      ],
      voss_free: [
        "The Bishop Walks Free · Dawn",
        "Days later · A parcel",
        "The black bishop",
      ],
      fire: [
        "The Burning Board · The library",
        "The household evacuated",
        "Five lives saved · One case lost",
      ],
      checkmate: [
        "Checkmate · The household assembled",
        "The evidence is secured",
        "The final move",
      ],
    };
    return labels[this.endingId]?.[this.endingShot] || "";
  }

  nextEndingShot() {
    this.setEndingShot((this.endingShot + 1) % 3);
    return this.endingSceneLabel;
  }

  private setEndingShot(index: number) {
    this.endingShot = index;
    this.endingClock = 0;
    const shots: Record<string, number[][]> = {
      scarlet: [
        [2.4, 0, 5.5, 9.5],
        [1.0, 0.4, 13.4, 6.5],
        [18.4, 0.5, 5.3, 4.3],
      ],
      ash: [
        [10.5, 0, 13.4, 9.5],
        [12.35, 0.8, 10.8, 4],
        [10.8, 0.2, 3.4, 4.0],
      ],
      mara: [
        [18.4, 0, 13.6, 9.5],
        [22.65, 0.5, 10.95, 4.3],
        [19.2, 0.3, 9.4, 5.5],
      ],
      voss_free: [
        [2.4, 0, 4.8, 9.5],
        [5.7, 0.5, 5.3, 4.3],
        [5.8, 1.05, 5.3, 2.6],
      ],
      fire: [
        [1.0, 0.5, 13.4, 7.5],
        [2.0, 0, 4.9, 9.0],
        [2.2, 0, 4.4, 8.3],
      ],
      checkmate: [
        [10.4, 0, 5.8, 10.5],
        [11.1, 0.6, 3.9, 6],
        [11.65, 1.0, 2.4, 3.1],
      ],
    };
    const [x, y, z, height] = shots[this.endingId][index];
    this.cameraTarget.set(x, y, z);
    this.cameraHeight = height;
    this.resize();
    if (this.endingId === "mara" && index > 0) {
      this.actors.get("mara")!.visible = false;
      this.actors.get("flint")!.visible = false;
    } else if (this.endingId === "mara") {
      this.actors.get("mara")!.visible = true;
      this.actors.get("flint")!.visible = true;
    }
  }
  update(time: number) {
    const elapsed = this.last ? (time - this.last) / 1000 : 0;
    const dt = Math.min(elapsed || 0.016, 0.05);
    this.last = time;
    if (this.frames.length > 300) this.frames.shift();
    if (elapsed > 0 && !document.hidden) this.frames.push(elapsed);
    if (this.ready && !this.modal && this.cameraMode === "follow") {
      let right =
        (this.keys.has("d") || this.keys.has("arrowright") ? 1 : 0) -
        (this.keys.has("a") || this.keys.has("arrowleft") ? 1 : 0);
      let up =
        (this.keys.has("w") || this.keys.has("arrowup") ? 1 : 0) -
        (this.keys.has("s") || this.keys.has("arrowdown") ? 1 : 0);
      const touchStrength = this.touchMove.length();
      if (touchStrength > 0) {
        right = this.touchMove.x;
        up = -this.touchMove.y;
      }
      const dir = new THREE.Vector3(
        (right - up) * Math.SQRT1_2,
        0,
        (-right - up) * Math.SQRT1_2,
      );
      if (dir.lengthSq() > 0) dir.normalize();
      if (touchStrength > 0) dir.multiplyScalar(Math.min(1, touchStrength));
      const speed = this.keys.has("shift") ? 4.2 : 2.8;
      this.velocity.lerp(dir.multiplyScalar(speed), 1 - Math.exp(-14 * dt));
      const nx = this.position.x + this.velocity.x * dt,
        nz = this.position.z + this.velocity.z * dt;
      if (!this.blocked(nx, this.position.z)) this.position.x = nx;
      if (!this.blocked(this.position.x, nz)) this.position.z = nz;
      this.player.position.copy(this.position);
      if (this.velocity.length() > 0.15) {
        const target = Math.atan2(this.velocity.x, this.velocity.z);
        let delta =
          THREE.MathUtils.euclideanModulo(
            target - this.lean.rotation.y + Math.PI,
            Math.PI * 2,
          ) - Math.PI;
        this.lean.rotation.y += delta * (1 - Math.exp(-9 * dt));
        this.walkSound += dt;
        if (this.walkSound > 0.38) {
          this.walkSound = 0;
          this.onMove();
        }
      }
      this.lean.rotation.z = THREE.MathUtils.damp(
        this.lean.rotation.z,
        this.settings.reducedMotion ? 0 : -this.velocity.x * 0.018,
        8,
        dt,
      );
      this.lean.rotation.x = THREE.MathUtils.damp(
        this.lean.rotation.x,
        this.settings.reducedMotion ? 0 : this.velocity.z * 0.018,
        8,
        dt,
      );
      this.checkRoom();
      const near = this.nearestTarget();
      if (near?.id !== this.nearest?.id) {
        this.nearest = near;
        this.onNear(near);
      }
      this.ring.visible = !!near;
      if (near) {
        this.ring.position.set(near.x, 0.038, near.z);
        this.ring.scale.setScalar(near.kind === "suspect" ? 0.9 : 0.68);
      }
    } else {
      this.ring.visible = false;
      this.lean.rotation.x *= 0.9;
      this.lean.rotation.z *= 0.9;
    }
    if (this.cameraMode === "follow") {
      this.follow.lerp(
        this.position,
        this.settings.reducedMotion ? 1 : 1 - Math.exp(-6 * dt),
      );
      this.focus.copy(this.follow);
    } else
      this.focus.lerp(
        this.cameraTarget,
        this.settings.reducedMotion ? 1 : 1 - Math.exp(-5 * dt),
      );
    const offset =
      this.cameraMode === "actor"
        ? new THREE.Vector3(3, 4.5, 5)
        : new THREE.Vector3(11, 22.2, 11);
    this.camera.position.copy(this.focus).add(offset);
    this.camera.lookAt(this.focus);
    this.updateWallFades(offset, dt);
    if (this.endingId) {
      this.endingClock += dt;
      const t = this.settings.reducedMotion
        ? 0
        : Math.min(this.endingClock * 0.08, 0.55);
      if (this.endingId === "scarlet" || this.endingId === "voss_free") {
        const who = this.actors.get(
          this.endingId === "scarlet" ? "scarlet" : "voss",
        )!;
        who.position.z = (this.endingId === "scarlet" ? 2.2 : 2.0) - t;
      }
    }
    if (this.endingId === "checkmate") {
      const knight = this.endingCast.find(
        (object) => object.name === "Miniature knight",
      );
      if (knight)
        knight.position.x =
          11.23 +
          (this.endingShot === 2
            ? Math.min(this.endingClock / 3, 1) * 0.27
            : 0);
    }
    this.renderer.render(this.scene, this.camera);
  }
  stats() {
    return {
      frames: this.frames.length,
      averageFPS: Math.round(
        this.frames.length / this.frames.reduce((a, b) => a + b, 0),
      ),
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
    };
  }
}
