import * as THREE from 'three';
import type { OutlineKind } from '../shared/types';

/**
 * Closed 2D path parametrized by normalized arc length t ∈ [0,1).
 * All nested loops advance t at the same rate (lap-synced conveyor),
 * so segments at equal fractions stay aligned on any outline shape.
 */
export class OutlinePath {
  readonly points: THREE.Vector2[];
  private cumulative: number[];
  readonly totalLength: number;

  constructor(points: THREE.Vector2[]) {
    this.points = points;
    this.cumulative = [0];
    let acc = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      acc += a.distanceTo(b);
      this.cumulative.push(acc);
    }
    this.totalLength = acc;
  }

  pointAt(t: number): THREE.Vector2 {
    let u = t % 1;
    if (u < 0) u += 1;
    const target = u * this.totalLength;
    // binary search over cumulative lengths
    let lo = 0;
    let hi = this.points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.cumulative[mid] <= target) lo = mid;
      else hi = mid - 1;
    }
    const segStart = this.cumulative[lo];
    const segLen = this.cumulative[lo + 1] - segStart;
    const f = segLen > 0 ? (target - segStart) / segLen : 0;
    const a = this.points[lo];
    const b = this.points[(lo + 1) % this.points.length];
    return new THREE.Vector2(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
  }
}

function polygon(sides: number, radius: number, startAngle: number): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < sides; i++) {
    const a = startAngle + (i / sides) * Math.PI * 2;
    pts.push(new THREE.Vector2(Math.cos(a) * radius, Math.sin(a) * radius));
  }
  return pts;
}

export function outlinePoints(kind: OutlineKind, radius: number): THREE.Vector2[] {
  switch (kind) {
    case 'circle':
      return polygon(96, radius, Math.PI / 2);
    case 'square':
      return polygon(4, radius, Math.PI / 4);
    case 'triangle':
      return polygon(3, radius, Math.PI / 2);
    case 'hexagon':
      return polygon(6, radius, Math.PI / 2);
    case 'star': {
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? radius : radius * 0.52;
        const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
        pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
      }
      return pts;
    }
    case 'heart': {
      // crisp icon-style heart from Bézier curves (deep cleft, pointed tip),
      // pre-stretched vertically to counter the pie tilt's foreshortening
      const s = new THREE.Shape();
      s.moveTo(12, 21.35);
      s.lineTo(10.55, 20.03);
      s.bezierCurveTo(5.4, 15.36, 2, 12.28, 2, 8.5);
      s.bezierCurveTo(2, 5.42, 4.42, 3, 7.5, 3);
      s.bezierCurveTo(9.24, 3, 10.91, 3.81, 12, 5.09);
      s.bezierCurveTo(13.09, 3.81, 14.76, 3, 16.5, 3);
      s.bezierCurveTo(19.58, 3, 22, 5.42, 22, 8.5);
      s.bezierCurveTo(22, 12.28, 18.6, 15.36, 13.45, 20.04);
      s.lineTo(12, 21.35);
      const spaced = s.getSpacedPoints(96);
      spaced.pop(); // closed path: last point duplicates the first
      const raw: THREE.Vector2[] = [];
      let maxLen = 0;
      for (const p of spaced) {
        const x = p.x - 12;
        const y = -(p.y - 12.2) * 1.15; // flip SVG y-down, counter the tilt squash
        raw.push(new THREE.Vector2(x, y));
        maxLen = Math.max(maxLen, Math.hypot(x, y));
      }
      return raw.map((p) => p.multiplyScalar(radius / maxLen));
    }
    case 'blob': {
      // asymmetric organic blob: layered sine harmonics on the radius.
      // r stays well positive, so every center ray crosses the outline once
      // (the invariant the conveyor + clear-ray rules need).
      const raw: THREE.Vector2[] = [];
      let maxLen = 0;
      for (let i = 0; i < 128; i++) {
        const a = (i / 128) * Math.PI * 2;
        const r =
          1 +
          0.14 * Math.sin(2 * a + 0.5) +
          0.11 * Math.sin(3 * a + 1.7) +
          0.08 * Math.sin(5 * a + 3.1) +
          0.05 * Math.sin(7 * a + 0.9);
        raw.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
        maxLen = Math.max(maxLen, r);
      }
      return raw.map((p) => p.multiplyScalar(radius / maxLen));
    }
  }
}

/**
 * Nested loops are CONSTANT radial offsets of the same base outline: loop i sits
 * d[i] world units inward, and every loop's band has the same half-width. Because
 * all loops sample the base path at the same parameter t, segments at equal
 * fractions stay exactly radially aligned on any shape.
 */
export interface LoopLayout {
  d: number[]; // inward radial offset per loop (d[0] = 0)
  bandW: number; // band half-width, identical for all loops
  minRadius: number; // smallest |p| on the base outline
}

export function computeLoopLayout(kind: OutlineKind, loopCount: number, outerRadius: number): LoopLayout {
  const pts = outlinePoints(kind, outerRadius);
  let m = Infinity;
  for (const p of pts) m = Math.min(m, Math.hypot(p.x, p.y));
  const MAX_W = 0.115;
  const margin = 0.12;
  let spacing = 0;
  let w = MAX_W;
  if (loopCount > 1) {
    spacing = Math.min(0.42, (m - MAX_W - margin) / (loopCount - 1));
    spacing = Math.max(spacing, 0.12);
    w = Math.max(Math.min(MAX_W, (spacing - 0.05) / 2), 0.04);
  }
  return {
    d: Array.from({ length: loopCount }, (_, i) => i * spacing),
    bandW: w,
    minRadius: m,
  };
}

/** Perimeter of nested loop li (for length-proportional dot counts). */
export function loopPerimeter(kind: OutlineKind, li: number, loopCount: number, outerRadius: number): number {
  const base = new OutlinePath(outlinePoints(kind, outerRadius));
  const { d } = computeLoopLayout(kind, loopCount, outerRadius);
  let sum = 0;
  let prev: THREE.Vector2 | null = null;
  let first: THREE.Vector2 | null = null;
  const N = 200;
  for (let i = 0; i < N; i++) {
    const p = base.pointAt(i / N);
    const len = Math.max(Math.hypot(p.x, p.y), 1e-5);
    const f = Math.max((len - d[li]) / len, 0.01);
    const q = new THREE.Vector2(p.x * f, p.y * f);
    if (prev) sum += prev.distanceTo(q);
    else first = q;
    prev = q;
  }
  if (prev && first) sum += prev.distanceTo(first);
  return sum;
}
