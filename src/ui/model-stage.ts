import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export const characterModels = [
  {
    asset: "CHR_knight",
    name: "Detective Knight",
    piece: "Knight · The investigator",
  },
  {
    asset: "CHR_scarlet",
    name: "Lady Scarlet",
    piece: "Queen · Blackrook Manor",
  },
  { asset: "CHR_king", name: "Lord Ivory", piece: "King · Upright reference" },
  {
    asset: "CHR_king_fallen",
    name: "Lord Ivory, fallen",
    piece: "King · Crime-scene variant",
  },
  { asset: "CHR_ash", name: "Prince Ash", piece: "Pawn · The heir" },
  {
    asset: "CHR_voss",
    name: "Chancellor Voss",
    piece: "Bishop · The chancellor",
  },
  { asset: "CHR_flint", name: "Captain Flint", piece: "Rook · The captain" },
  { asset: "CHR_mara", name: "Mara", piece: "Pawn · The housekeeper" },
];

/**
 * A separate, reusable 3D stage for comic portraits and the white model viewer.
 * It never moves or hides an actor in the playable mansion.
 */
export class ModelStage {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private controls: OrbitControls | null = null;
  private subject: THREE.Group | null = null;
  private floor: THREE.Mesh | null = null;
  private host: HTMLElement | null = null;
  private observer: ResizeObserver | null = null;
  private centre = new THREE.Vector3();
  private viewHeight = 3;
  private asset = "";
  mode: "hidden" | "portrait" | "gallery" = "hidden";

  constructor(private cloneAsset: (name: string) => THREE.Group) {}

  private initialize() {
    if (this.renderer) return;
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute("role", "img");
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minZoom = 0.6;
    this.controls.maxZoom = 2.7;
    this.controls.maxPolarAngle = Math.PI * 0.53;
    this.controls.minPolarAngle = Math.PI * 0.12;

    this.scene.add(new THREE.HemisphereLight("#ffffff", "#8a8b90", 2.8));
    const key = new THREE.DirectionalLight("#fff4e6", 3.1);
    key.position.set(-3, 6, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = key.shadow.camera.bottom = -3;
    key.shadow.camera.right = key.shadow.camera.top = 3;
    key.shadow.normalBias = 0.018;
    key.shadow.radius = 3;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight("#e7ecf3", 1.3);
    fill.position.set(4, 3, -3);
    this.scene.add(fill);

    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ opacity: 0.13 }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.008;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
    this.observer = new ResizeObserver(() => this.resize());
  }

  show(asset: string, host: HTMLElement, mode: "portrait" | "gallery") {
    this.initialize();
    this.observer!.disconnect();
    this.mode = mode;
    this.host = host;
    this.asset = asset;
    host.append(this.renderer!.domElement);
    this.renderer!.domElement.setAttribute(
      "aria-label",
      asset.replace("CHR_", "") + " chess model",
    );
    this.observer!.observe(host);
    this.scene.background =
      mode === "gallery" ? new THREE.Color("#ffffff") : null;
    this.renderer!.setClearColor("#ffffff", mode === "gallery" ? 1 : 0);
    this.floor!.visible = mode === "gallery";
    this.controls!.enabled = mode === "gallery";
    this.controls!.enableZoom = mode === "gallery";
    if (this.subject) this.scene.remove(this.subject);
    this.subject = this.cloneAsset(asset);
    this.subject.traverse((part) => {
      if (part instanceof THREE.Mesh) {
        part.castShadow = true;
        part.receiveShadow = true;
      }
    });
    this.scene.add(this.subject);
    this.subject.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(this.subject);
    const centre = bounds.getCenter(new THREE.Vector3());
    this.subject.position.x -= centre.x;
    this.subject.position.z -= centre.z;
    this.subject.position.y -= bounds.min.y;
    this.subject.updateWorldMatrix(true, true);
    const size = bounds.getSize(new THREE.Vector3());
    this.centre.set(0, size.y * 0.49, 0);
    const aspect = Math.max(
      0.5,
      host.clientWidth / Math.max(1, host.clientHeight),
    );
    this.viewHeight =
      Math.max(size.y, size.x / aspect) * (mode === "portrait" ? 1.17 : 1.32);
    this.resetCamera();
    this.resize();
  }

  resetCamera() {
    if (!this.controls) return;
    this.camera.zoom = 1;
    if (this.subject) this.subject.rotation.y = 0;
    this.camera.position.copy(this.centre).add(new THREE.Vector3(3.5, 2.3, 6));
    this.camera.lookAt(this.centre);
    this.controls.target.copy(this.centre);
    this.controls.update();
    this.camera.updateProjectionMatrix();
  }

  rotate(amount: number) {
    if (this.subject) this.subject.rotation.y += amount;
  }

  private resize() {
    if (!this.host || !this.renderer) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    const aspect = width / height;
    this.renderer.setSize(width, height, false);
    this.camera.left = (-this.viewHeight * aspect) / 2;
    this.camera.right = (this.viewHeight * aspect) / 2;
    this.camera.top = this.viewHeight / 2;
    this.camera.bottom = -this.viewHeight / 2;
    this.camera.updateProjectionMatrix();
  }

  hide() {
    this.mode = "hidden";
    this.observer?.disconnect();
    if (this.controls) this.controls.enabled = false;
    this.host = null;
  }

  render(reducedMotion: boolean) {
    if (this.mode === "hidden" || !this.renderer) return;
    if (this.controls) {
      this.controls.enableDamping = !reducedMotion;
      this.controls.update();
    }
    this.renderer.render(this.scene, this.camera);
  }

  get snapshot() {
    return {
      mode: this.mode,
      asset: this.asset,
      camera: this.camera.position.toArray(),
      rotation: this.subject?.rotation.y || 0,
    };
  }
}
