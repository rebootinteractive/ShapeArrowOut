import * as THREE from 'three';
import type { ColorKey } from '../shared/types';
import { COLOR_HEX } from '../shared/colors';

interface Flight {
  obj: THREE.Group;
  mat: THREE.MeshLambertMaterial;
  flat: THREE.Vector3; // position without the arc bump
  prev: THREE.Vector3;
  elapsed: number;
  dur: number;
  getTarget: () => THREE.Vector3;
  onArrive: (obj: THREE.Group, mat: THREE.MeshLambertMaterial) => void;
}

const UP = new THREE.Vector3(0, 1, 0);
const ARC_HEIGHT = 0.85;

/**
 * 3D dart projectiles: cone head + cylinder shaft, flying a lobbed arc to a
 * (moving) dot. On arrival the dart is handed to the shape, which plants it.
 */
export class ArrowSystem {
  private group = new THREE.Group();
  private headGeo = new THREE.ConeGeometry(0.055, 0.14, 12);
  private shaftGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.24, 10);
  private flights: Flight[] = [];

  constructor(private scene: THREE.Scene) {
    scene.add(this.group);
  }

  /** Dart centered on origin, tip at +Y 0.19, tail at -0.19. Own material (fades later). */
  private makeDart(color: ColorKey): { obj: THREE.Group; mat: THREE.MeshLambertMaterial } {
    const mat = new THREE.MeshLambertMaterial({ color: COLOR_HEX[color], transparent: true });
    const head = new THREE.Mesh(this.headGeo, mat);
    head.position.y = 0.12;
    const shaft = new THREE.Mesh(this.shaftGeo, mat);
    shaft.position.y = -0.07;
    const obj = new THREE.Group();
    obj.add(head, shaft);
    return { obj, mat };
  }

  spawn(
    from: THREE.Vector3,
    color: ColorKey,
    getTarget: () => THREE.Vector3,
    onArrive: (obj: THREE.Group, mat: THREE.MeshLambertMaterial) => void
  ) {
    const { obj, mat } = this.makeDart(color);
    obj.position.copy(from);
    this.group.add(obj);
    this.flights.push({
      obj,
      mat,
      flat: from.clone(),
      prev: from.clone(),
      elapsed: 0,
      dur: 0.38,
      getTarget,
      onArrive,
    });
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
        this.group.remove(f.obj);
        this.flights.splice(i, 1);
        f.onArrive(f.obj, f.mat); // shape takes ownership and plants it
        continue;
      }
      const step = Math.min(dt / remaining, 1);
      f.flat.lerp(target, step);
      const t = f.elapsed / f.dur;
      f.prev.copy(f.obj.position);
      f.obj.position.set(f.flat.x, f.flat.y, f.flat.z + Math.sin(t * Math.PI) * ARC_HEIGHT);
      const vel = f.obj.position.clone().sub(f.prev);
      if (vel.lengthSq() > 1e-8) {
        f.obj.quaternion.setFromUnitVectors(UP, vel.normalize());
      }
    }
  }

  dispose() {
    for (const f of this.flights) {
      this.group.remove(f.obj);
      f.mat.dispose();
    }
    this.flights = [];
    this.headGeo.dispose();
    this.shaftGeo.dispose();
    this.scene.remove(this.group);
  }
}
