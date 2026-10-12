import * as THREE from 'three';

/**
 * ドラッグで回転・ホイール／ピンチでズームする軌道カメラ。
 * ビューアから届く正規化ポインタ座標（0..1）だけで動くので、DOMイベントを直接扱わず
 * 共有プレビューレンダラーでも安全に使える（イベントリスナーの解除漏れが起きない）。
 */
export class OrbitRig {
  readonly target = new THREE.Vector3();
  azimuth: number;
  elevation: number;
  distance: number;
  autoRotate = true;
  private readonly initial: { azimuth: number; elevation: number; distance: number; target: THREE.Vector3 };
  private last: { x: number; y: number } | null = null;
  private idle = 0;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    opts: { azimuth?: number; elevation?: number; distance?: number; target?: THREE.Vector3; minDistance?: number; maxDistance?: number } = {},
  ) {
    this.azimuth = opts.azimuth ?? 0.6;
    this.elevation = opts.elevation ?? 0.45;
    this.distance = opts.distance ?? 8;
    if (opts.target) this.target.copy(opts.target);
    this.minDistance = opts.minDistance ?? 1;
    this.maxDistance = opts.maxDistance ?? 200;
    this.initial = { azimuth: this.azimuth, elevation: this.elevation, distance: this.distance, target: this.target.clone() };
    this.apply();
  }

  minDistance: number;
  maxDistance: number;

  pointer(x: number, y: number, down: boolean): void {
    if (!down) {
      this.last = null;
      return;
    }
    if (this.last) {
      this.azimuth -= (x - this.last.x) * 5;
      this.elevation = THREE.MathUtils.clamp(this.elevation - (y - this.last.y) * 3, -1.45, 1.45);
    }
    this.last = { x, y };
    this.idle = 0;
  }

  wheel(delta: number): void {
    this.distance = THREE.MathUtils.clamp(this.distance * Math.exp(delta * 0.0015), this.minDistance, this.maxDistance);
    this.idle = 0;
  }

  reset(): void {
    this.azimuth = this.initial.azimuth;
    this.elevation = this.initial.elevation;
    this.distance = this.initial.distance;
    this.target.copy(this.initial.target);
  }

  /** dt秒進める。操作がない間はゆっくり自動回転する */
  update(dt: number, aspect: number): void {
    this.idle += dt;
    if (this.autoRotate && this.idle > 2 && !this.last) this.azimuth += dt * 0.15;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.apply();
  }

  private apply(): void {
    const c = Math.cos(this.elevation);
    this.camera.position.set(
      this.target.x + Math.sin(this.azimuth) * c * this.distance,
      this.target.y + Math.sin(this.elevation) * this.distance,
      this.target.z + Math.cos(this.azimuth) * c * this.distance,
    );
    this.camera.lookAt(this.target);
  }
}
