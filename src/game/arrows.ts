import * as THREE from 'three';
import type { ColorKey } from '../shared/types';
import { COLOR_HEX } from '../shared/colors';

interface Flight {
  mesh: THREE.Mesh;
  elapsed: number;
  dur: number;
  getTarget: () => THREE.Vector3;
  onArrive: () => void;
}

/** Homing arrow projectiles from deck containers to (moving) dots. */
export class ArrowSystem {
  private group = new THREE.Group();
  private geo: THREE.ShapeGeometry;
  // shared per-color materials — never mutated, safe to share
  private mats = new Map<ColorKey, THREE.MeshBasicMaterial>();
  private flights: Flight[] = [];

  constructor(private scene: THREE.Scene) {
    const s = new THREE.Shape();
    s.moveTo(0, 0.16);
    s.lineTo(-0.065, -0.11);
    s.lineTo(0, -0.05);
    s.lineTo(0.065, -0.11);
    s.closePath();
    this.geo = new THREE.ShapeGeometry(s);
    scene.add(this.group);
  }

  private mat(color: ColorKey): THREE.MeshBasicMaterial {
    let m = this.mats.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: COLOR_HEX[color] });
      this.mats.set(color, m);
    }
    return m;
  }

  spawn(from: THREE.Vector3, color: ColorKey, getTarget: () => THREE.Vector3, onArrive: () => void) {
    const mesh = new THREE.Mesh(this.geo, this.mat(color));
    mesh.position.copy(from);
    mesh.position.z = 0.2;
    this.group.add(mesh);
    this.flights.push({ mesh, elapsed: 0, dur: 0.3, getTarget, onArrive });
  }

  inFlight(): number {
    return this.flights.length;
  }

  update(dt: number) {
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i];
      f.elapsed += dt;
      const target = f.getTarget();
      const remaining = f.dur - f.elapsed;
      if (remaining <= 0) {
        this.group.remove(f.mesh);
        this.flights.splice(i, 1);
        f.onArrive();
        continue;
      }
      const step = Math.min(dt / remaining, 1);
      const dx = target.x - f.mesh.position.x;
      const dy = target.y - f.mesh.position.y;
      f.mesh.position.x += dx * step;
      f.mesh.position.y += dy * step;
      if (dx * dx + dy * dy > 1e-6) f.mesh.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;
    }
  }

  dispose() {
    for (const f of this.flights) this.group.remove(f.mesh);
    this.flights = [];
    this.geo.dispose();
    for (const m of this.mats.values()) m.dispose();
    this.scene.remove(this.group);
  }
}
