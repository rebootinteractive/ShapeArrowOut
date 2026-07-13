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
}

interface SegState {
  loop: number;
  idx: number;
  color: ColorKey;
  dots: DotState[];
  filledCount: number;
  destroyed: boolean;
  destroyT: number; // -1 = not animating, [0..1] = animating out
}

const WINDOW_CENTER = -Math.PI / 2;
const WINDOW_HALF = Math.PI / 4; // 90° window at the bottom of the shape
const DOT_RADIUS = 0.062;
const BG_COLOR = new THREE.Color(0x232838);

function normAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class ShapeSystem {
  private group = new THREE.Group();
  private paths: OutlinePath[] = [];
  private segs: SegState[] = [];
  private segsByLoop: SegState[][] = [];
  private phase = 0;
  private dotGeo = new THREE.CircleGeometry(DOT_RADIUS, 20);
  private trackLines: THREE.LineLoop[] = [];
  private wedge: THREE.Mesh;

  constructor(
    private scene: THREE.Scene,
    private cfg: ShapeConfig,
    private center: THREE.Vector2,
    private outerRadius: number
  ) {
    this.group.position.set(center.x, center.y, 0);
    scene.add(this.group);

    // window wedge indicator
    const innerR = loopRadius(cfg.loops.length - 1, outerRadius) * 0.62;
    const wedgeGeo = new THREE.RingGeometry(innerR, outerRadius * 1.12, 40, 1, Math.PI * 1.25, Math.PI / 2);
    this.wedge = new THREE.Mesh(
      wedgeGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.055 })
    );
    this.wedge.position.z = -0.05;
    this.group.add(this.wedge);

    cfg.loops.forEach((loopDef, li) => {
      const path = buildPath(cfg.shape, li, outerRadius);
      this.paths.push(path);

      // faint track line
      const trackPts = path.points.map((p) => new THREE.Vector3(p.x, p.y, -0.02));
      const track = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(trackPts),
        new THREE.LineBasicMaterial({ color: 0x2c3245 })
      );
      this.group.add(track);
      this.trackLines.push(track);

      const nSegs = loopDef.segments.length;
      const loopSegs: SegState[] = [];
      loopDef.segments.forEach((segDef, si) => {
        const seg: SegState = {
          loop: li,
          idx: si,
          color: segDef.color,
          dots: [],
          filledCount: 0,
          destroyed: false,
          destroyT: -1,
        };
        const start = si / nSegs;
        const width = 1 / nSegs;
        for (let d = 0; d < segDef.dots; d++) {
          const baseT = start + ((d + 0.5) / segDef.dots) * width;
          const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 1 });
          mat.color.setHex(COLOR_HEX[segDef.color]).lerp(BG_COLOR, 0.55);
          const mesh = new THREE.Mesh(this.dotGeo, mat);
          this.group.add(mesh);
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
    return new THREE.Vector3(this.center.x + p.x, this.center.y + p.y, 0.05);
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
    (dot.mesh.material as THREE.MeshBasicMaterial).color.setHex(COLOR_HEX[dot.color]);
    const seg = this.segsByLoop[dot.loop][dot.segIdx];
    seg.filledCount++;
    if (seg.filledCount >= seg.dots.length) {
      seg.destroyed = true; // occlusion lifts immediately
      seg.destroyT = 0;
    }
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
      if (seg.destroyT >= 0) {
        seg.destroyT += dt / 0.4;
        const t = Math.min(seg.destroyT, 1);
        const ease = t * t;
        for (const dot of seg.dots) {
          const p = this.paths[seg.loop].pointAt(dot.baseT + this.phase);
          const len = Math.max(p.length(), 1e-5);
          const drift = 1 + ease * 0.3;
          dot.mesh.position.set((p.x / len) * len * drift, (p.y / len) * len * drift, 0.03);
          dot.mesh.scale.setScalar(Math.max(1 - ease, 0.0001));
          (dot.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - ease;
        }
        if (seg.destroyT >= 1) {
          for (const dot of seg.dots) {
            this.group.remove(dot.mesh);
            (dot.mesh.material as THREE.Material).dispose();
          }
          seg.destroyT = -1;
          seg.dots.forEach((d) => (d.popT = -1));
        }
        continue;
      }
      if (seg.destroyed) continue;
      for (const dot of seg.dots) {
        const p = this.paths[seg.loop].pointAt(dot.baseT + this.phase);
        dot.mesh.position.set(p.x, p.y, 0.02);
        if (dot.popT >= 0) {
          dot.popT += dt / 0.22;
          const t = Math.min(dot.popT, 1);
          dot.mesh.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.5);
          if (dot.popT >= 1) dot.popT = -1;
        }
      }
    }
  }

  dispose() {
    for (const seg of this.segs) {
      for (const dot of seg.dots) {
        this.group.remove(dot.mesh);
        (dot.mesh.material as THREE.Material).dispose();
      }
    }
    for (const track of this.trackLines) {
      track.geometry.dispose();
      (track.material as THREE.Material).dispose();
    }
    this.wedge.geometry.dispose();
    (this.wedge.material as THREE.Material).dispose();
    this.dotGeo.dispose();
    this.scene.remove(this.group);
  }
}
