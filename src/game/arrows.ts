import * as THREE from 'three';
import type { ColorKey } from '../shared/types';
import { COLOR_HEX } from '../shared/colors';

interface Flight {
  obj: THREE.Group;
  mats: THREE.Material[];
  flat: THREE.Vector3; // position without the arc bump
  prev: THREE.Vector3;
  spin: number;
  elapsed: number;
  dur: number;
  getTarget: () => THREE.Vector3;
  onArrive: (obj: THREE.Group, mats: THREE.Material[]) => void;
}

const UP = new THREE.Vector3(0, 1, 0);
const ARC_HEIGHT = 0.85;

/**
 * Polished 3D darts: metallic tip, colored shaft, 3-fin fletching and a nock,
 * spinning along a lobbed arc to a (moving) dot. On arrival the dart is handed
 * to the shape, which plants it.
 */
export class ArrowSystem {
  private group = new THREE.Group();
  private tipGeo = new THREE.ConeGeometry(0.042, 0.13, 12);
  private collarGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.028, 10);
  private shaftGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.26, 10);
  private finGeo = new THREE.PlaneGeometry(0.062, 0.095);
  private nockGeo = new THREE.SphereGeometry(0.02, 8, 6);
  private flights: Flight[] = [];

  constructor(private scene: THREE.Scene) {
    scene.add(this.group);
  }

  /** Dart along +Y: tip at +0.2, nock at -0.2. Own materials (they fade later). */
  private makeDart(color: ColorKey): { obj: THREE.Group; mats: THREE.Material[] } {
    const base = new THREE.Color(COLOR_HEX[color]);
    const tipMat = new THREE.MeshPhongMaterial({
      color: base.clone().lerp(new THREE.Color(0xffffff), 0.75),
      shininess: 90,
      transparent: true,
    });
    const shaftMat = new THREE.MeshPhongMaterial({ color: base, shininess: 40, transparent: true });
    const finMat = new THREE.MeshPhongMaterial({
      color: base.clone().lerp(new THREE.Color(0xffffff), 0.35),
      side: THREE.DoubleSide,
      shininess: 20,
      transparent: true,
    });

    const obj = new THREE.Group();
    const tip = new THREE.Mesh(this.tipGeo, tipMat);
    tip.position.y = 0.135;
    const collar = new THREE.Mesh(this.collarGeo, tipMat);
    collar.position.y = 0.06;
    const shaft = new THREE.Mesh(this.shaftGeo, shaftMat);
    shaft.position.y = -0.07;
    const nock = new THREE.Mesh(this.nockGeo, tipMat);
    nock.position.y = -0.2;
    obj.add(tip, collar, shaft, nock);
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(this.finGeo, finMat);
      fin.position.y = -0.155;
      fin.rotation.y = (i / 3) * Math.PI * 2;
      // fins stand out radially from the shaft
      fin.translateOnAxis(new THREE.Vector3(0, 0, 1).applyEuler(fin.rotation), 0.033);
      obj.add(fin);
    }
    return { obj, mats: [tipMat, shaftMat, finMat] };
  }

  spawn(
    from: THREE.Vector3,
    color: ColorKey,
    getTarget: () => THREE.Vector3,
    onArrive: (obj: THREE.Group, mats: THREE.Material[]) => void
  ) {
    const { obj, mats } = this.makeDart(color);
    obj.position.copy(from);
    this.group.add(obj);
    this.flights.push({
      obj,
      mats,
      flat: from.clone(),
      prev: from.clone(),
      spin: Math.random() * Math.PI * 2,
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
    const spinAxis = new THREE.Vector3(0, 1, 0);
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i];
      f.elapsed += dt;
      const target = f.getTarget();
      const remaining = f.dur - f.elapsed;
      if (remaining <= 0) {
        this.group.remove(f.obj);
        this.flights.splice(i, 1);
        f.onArrive(f.obj, f.mats); // shape takes ownership and plants it
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
      f.spin += dt * 14;
      f.obj.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(spinAxis, f.spin));
    }
  }

  dispose() {
    for (const f of this.flights) {
      this.group.remove(f.obj);
      for (const m of f.mats) m.dispose();
    }
    this.flights = [];
    this.tipGeo.dispose();
    this.collarGeo.dispose();
    this.shaftGeo.dispose();
    this.finGeo.dispose();
    this.nockGeo.dispose();
    this.scene.remove(this.group);
  }
}
