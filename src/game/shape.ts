import * as THREE from 'three';
import type { ColorKey, LoopDef, OutlineKind } from '../shared/types';
import { COLOR_HEX } from '../shared/colors';
import { OutlinePath, buildPath, loopRadius } from './outline';

export interface ShapeConfig {
  shape: OutlineKind;
  loops: LoopDef[];
  lapSeconds: number;
}

export interface DotState {
  loop: number;
  segIdx: number;
  baseT: number;
  color: ColorKey;
  filled: boolean;
  claimed: boolean;
  mesh: THREE.Mesh;
  popT: number;
  dartObj?: THREE.Object3D;
  dartMat?: THREE.MeshLambertMaterial;
}

const WINDOW_CENTER = -Math.PI / 2;
const WINDOW_HALF = Math.PI / 4; // 90° window at the bottom of the shape
const SLAB_H = 0.14; // segment thickness
const BAND_W = 0.125; // radial half-width of a segment slab
const GAP_FRAC = 0.006; // loop-fraction gap on each side so pie slices read separately
const DOT_RADIUS = 0.055;
const TILT = -0.62; // lean the whole pie back so slab sides are visible
const SOCKET_COLOR = 0x141824;

function normAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * One pie-slice slab: a thick band riding the outline conveyor.
 * Preallocated buffers, positions rewritten every frame as the segment slides.
 */
class SegmentBand {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshLambertMaterial;
  private positions: Float32Array;
  private samples: number;

  constructor(private path: OutlinePath, private tStart: number, private tWidth: number, color: ColorKey) {
    this.samples = Math.max(10, Math.ceil(this.tWidth * 140));
    const n = this.samples;
    const vertCount = 6 * (n + 1) + 8;
    this.positions = new Float32Array(vertCount * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

    const idx: number[] = [];
    const strip = (base: number) => {
      for (let j = 0; j < n; j++) {
        const a = base + j * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    };
    strip(0); // top face: in/out pairs
    strip(2 * (n + 1)); // outer wall: top/bottom pairs
    strip(4 * (n + 1)); // inner wall: top/bottom pairs
    const capBase = 6 * (n + 1);
    idx.push(capBase, capBase + 1, capBase + 2, capBase, capBase + 2, capBase + 3);
    idx.push(capBase + 4, capBase + 5, capBase + 6, capBase + 4, capBase + 6, capBase + 7);
    geo.setIndex(idx);

    this.material = new THREE.MeshLambertMaterial({
      color: COLOR_HEX[color],
      side: THREE.DoubleSide,
      transparent: true,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
  }

  /** Local (untilted) position on the band's centerline top at loop param t. */
  topPointAt(t: number, phase: number): THREE.Vector3 {
    const p = this.path.pointAt(t + phase);
    return new THREE.Vector3(p.x, p.y, SLAB_H);
  }

  updateGeometry(phase: number) {
    const n = this.samples;
    const pos = this.positions;
    const t0 = this.tStart + GAP_FRAC;
    const span = Math.max(this.tWidth - GAP_FRAC * 2, 0.001);
    const set = (vi: number, x: number, y: number, z: number) => {
      pos[vi * 3] = x;
      pos[vi * 3 + 1] = y;
      pos[vi * 3 + 2] = z;
    };
    let sIn = { x: 0, y: 0 };
    let sOut = { x: 0, y: 0 };
    let eIn = { x: 0, y: 0 };
    let eOut = { x: 0, y: 0 };
    for (let j = 0; j <= n; j++) {
      const t = t0 + (span * j) / n;
      const p = this.path.pointAt(t + phase);
      const len = Math.max(Math.hypot(p.x, p.y), 1e-5);
      const inS = Math.max(len - BAND_W, 0.01) / len;
      const outS = (len + BAND_W) / len;
      const ix = p.x * inS, iy = p.y * inS;
      const ox = p.x * outS, oy = p.y * outS;
      set(j * 2, ix, iy, SLAB_H);
      set(j * 2 + 1, ox, oy, SLAB_H);
      set(2 * (n + 1) + j * 2, ox, oy, SLAB_H);
      set(2 * (n + 1) + j * 2 + 1, ox, oy, 0);
      set(4 * (n + 1) + j * 2, ix, iy, SLAB_H);
      set(4 * (n + 1) + j * 2 + 1, ix, iy, 0);
      if (j === 0) { sIn = { x: ix, y: iy }; sOut = { x: ox, y: oy }; }
      if (j === n) { eIn = { x: ix, y: iy }; eOut = { x: ox, y: oy }; }
    }
    const capBase = 6 * (n + 1);
    set(capBase, sIn.x, sIn.y, SLAB_H);
    set(capBase + 1, sOut.x, sOut.y, SLAB_H);
    set(capBase + 2, sOut.x, sOut.y, 0);
    set(capBase + 3, sIn.x, sIn.y, 0);
    set(capBase + 4, eIn.x, eIn.y, SLAB_H);
    set(capBase + 5, eOut.x, eOut.y, SLAB_H);
    set(capBase + 6, eOut.x, eOut.y, 0);
    set(capBase + 7, eIn.x, eIn.y, 0);

    const attr = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

interface SegState {
  loop: number;
  idx: number;
  color: ColorKey;
  band: SegmentBand;
  group: THREE.Group;
  dots: DotState[];
  filledCount: number;
  destroyed: boolean;
  destroyT: number; // -1 = not animating, [0..1] = animating out
}

export class ShapeSystem {
  private group = new THREE.Group();
  private paths: OutlinePath[] = [];
  private segs: SegState[] = [];
  private segsByLoop: SegState[][] = [];
  private phase = 0;
  private dotGeo = new THREE.SphereGeometry(DOT_RADIUS, 16, 12);
  private wedge: THREE.Mesh;

  constructor(
    private scene: THREE.Scene,
    private cfg: ShapeConfig,
    private center: THREE.Vector2,
    private outerRadius: number
  ) {
    this.group.position.set(center.x, center.y, 0);
    this.group.rotation.x = TILT;
    scene.add(this.group);

    // window wedge indicator, flat under the slabs
    const innerR = loopRadius(cfg.loops.length - 1, outerRadius) * 0.6;
    const wedgeGeo = new THREE.RingGeometry(innerR, outerRadius * 1.14, 40, 1, Math.PI * 1.25, Math.PI / 2);
    this.wedge = new THREE.Mesh(
      wedgeGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.06 })
    );
    this.wedge.position.z = -0.03;
    this.group.add(this.wedge);

    cfg.loops.forEach((loopDef, li) => {
      const path = buildPath(cfg.shape, li, outerRadius);
      this.paths.push(path);
      const nSegs = loopDef.segments.length;
      const loopSegs: SegState[] = [];
      loopDef.segments.forEach((segDef, si) => {
        const start = si / nSegs;
        const width = 1 / nSegs;
        const band = new SegmentBand(path, start, width, segDef.color);
        const segGroup = new THREE.Group();
        segGroup.add(band.mesh);
        this.group.add(segGroup);
        const seg: SegState = {
          loop: li,
          idx: si,
          color: segDef.color,
          band,
          group: segGroup,
          dots: [],
          filledCount: 0,
          destroyed: false,
          destroyT: -1,
        };
        for (let d = 0; d < segDef.dots; d++) {
          const baseT = start + ((d + 0.5) / segDef.dots) * width;
          const mat = new THREE.MeshLambertMaterial({ color: SOCKET_COLOR, transparent: true });
          const mesh = new THREE.Mesh(this.dotGeo, mat);
          mesh.scale.setScalar(0.6);
          segGroup.add(mesh);
          seg.dots.push({
            loop: li,
            segIdx: si,
            baseT,
            color: segDef.color,
            filled: false,
            claimed: false,
            mesh,
            popT: -1,
          });
        }
        loopSegs.push(seg);
        this.segs.push(seg);
      });
      this.segsByLoop.push(loopSegs);
    });

    this.update(0);
  }

  private segAtParam(loop: number, t: number): SegState {
    const loopSegs = this.segsByLoop[loop];
    const idx = Math.min(Math.floor((t % 1) * loopSegs.length), loopSegs.length - 1);
    return loopSegs[idx];
  }

  /** Clear-ray rule: every outer segment covering this dot's loop-fraction is destroyed. */
  rayClear(dot: DotState): boolean {
    for (let o = 0; o < dot.loop; o++) {
      if (!this.segAtParam(o, dot.baseT).destroyed) return false;
    }
    return true;
  }

  private dotAngle(dot: DotState): number {
    const p = this.paths[dot.loop].pointAt(dot.baseT + this.phase);
    return Math.atan2(p.y, p.x);
  }

  inWindow(dot: DotState): boolean {
    return Math.abs(normAngle(this.dotAngle(dot) - WINDOW_CENTER)) <= WINDOW_HALF;
  }

  dotWorldPos(dot: DotState): THREE.Vector3 {
    const p = this.paths[dot.loop].pointAt(dot.baseT + this.phase);
    return this.group.localToWorld(new THREE.Vector3(p.x, p.y, SLAB_H + DOT_RADIUS));
  }

  /** Find + claim the best exposed dot of a color; null if none right now. */
  requestDot(color: ColorKey): DotState | null {
    let best: DotState | null = null;
    let bestProgress = -1;
    for (const seg of this.segs) {
      if (seg.destroyed || seg.color !== color) continue;
      for (const dot of seg.dots) {
        if (dot.filled || dot.claimed) continue;
        if (!this.rayClear(dot)) continue;
        const diff = normAngle(this.dotAngle(dot) - WINDOW_CENTER);
        if (Math.abs(diff) > WINDOW_HALF) continue;
        // conveyor moves CCW: dots exit the window at its CCW edge — prefer soonest to leave
        const progress = diff + WINDOW_HALF;
        if (progress > bestProgress) {
          bestProgress = progress;
          best = dot;
        }
      }
    }
    if (best) best.claimed = true;
    return best;
  }

  fillDot(dot: DotState) {
    if (dot.filled) return;
    dot.filled = true;
    dot.claimed = false;
    dot.popT = 0;
    const mat = dot.mesh.material as THREE.MeshLambertMaterial;
    mat.color.setHex(COLOR_HEX[dot.color]).lerp(new THREE.Color(0xffffff), 0.45);
    const seg = this.segsByLoop[dot.loop][dot.segIdx];
    seg.filledCount++;
    if (seg.filledCount >= seg.dots.length) {
      seg.destroyed = true; // occlusion lifts immediately
      seg.destroyT = 0;
    }
  }

  /** Take ownership of a landed dart: stick it in the dot, tail up, riding the conveyor. */
  plantArrow(dot: DotState, obj: THREE.Object3D, mat: THREE.MeshLambertMaterial) {
    const seg = this.segsByLoop[dot.loop][dot.segIdx];
    // tip points down into the slab, with a small random lean for a thrown-dart feel
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1));
    const lean = new THREE.Quaternion().setFromEuler(
      new THREE.Euler((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25, 0)
    );
    obj.quaternion.premultiply(lean);
    seg.group.add(obj);
    dot.dartObj = obj;
    dot.dartMat = mat;
  }

  /** Ignores the window (everything sweeps through it each lap): can this color ever fire again? */
  hasFireableEver(color: ColorKey): boolean {
    for (const seg of this.segs) {
      if (seg.destroyed || seg.color !== color) continue;
      for (const dot of seg.dots) {
        if (!dot.filled && !dot.claimed && this.rayClear(dot)) return true;
      }
    }
    return false;
  }

  remainingSegments(): number {
    return this.segs.filter((s) => !s.destroyed).length;
  }

  update(dt: number) {
    if (this.cfg.lapSeconds > 0) this.phase = (this.phase + dt / this.cfg.lapSeconds) % 1;

    for (const seg of this.segs) {
      if (seg.destroyed && seg.destroyT < 0) continue; // fully gone

      seg.band.updateGeometry(this.phase);
      for (const dot of seg.dots) {
        const p = this.paths[seg.loop].pointAt(dot.baseT + this.phase);
        dot.mesh.position.set(p.x, p.y, SLAB_H + DOT_RADIUS * 0.55);
        dot.dartObj?.position.set(p.x, p.y, SLAB_H + 0.13);
        if (dot.popT >= 0) {
          dot.popT += dt / 0.22;
          const t = Math.min(dot.popT, 1);
          dot.mesh.scale.setScalar(0.9 + Math.sin(t * Math.PI) * 0.45);
          if (dot.popT >= 1) {
            dot.popT = -1;
            dot.mesh.scale.setScalar(0.9);
          }
        }
      }

      if (seg.destroyT >= 0) {
        seg.destroyT += dt / 0.4;
        const t = Math.min(seg.destroyT, 1);
        const ease = t * t;
        seg.group.scale.setScalar(1 + ease * 0.22);
        seg.group.position.z = ease * 0.35;
        seg.band.material.opacity = 1 - ease;
        for (const dot of seg.dots) {
          (dot.mesh.material as THREE.MeshLambertMaterial).opacity = 1 - ease;
          if (dot.dartMat) dot.dartMat.opacity = 1 - ease;
        }
        if (seg.destroyT >= 1) {
          this.removeSegMeshes(seg);
          seg.destroyT = -1;
        }
      }
    }
  }

  private removeSegMeshes(seg: SegState) {
    for (const dot of seg.dots) {
      seg.group.remove(dot.mesh);
      (dot.mesh.material as THREE.Material).dispose();
      if (dot.dartObj) {
        seg.group.remove(dot.dartObj);
        dot.dartMat?.dispose();
        dot.dartObj = undefined;
        dot.dartMat = undefined;
      }
    }
    seg.band.dispose();
    this.group.remove(seg.group);
  }

  dispose() {
    for (const seg of this.segs) {
      if (!(seg.destroyed && seg.destroyT < 0)) this.removeSegMeshes(seg);
    }
    this.wedge.geometry.dispose();
    (this.wedge.material as THREE.Material).dispose();
    this.dotGeo.dispose();
    this.scene.remove(this.group);
  }
}
