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
      // classic parametric heart, recentred so radial band scaling stays star-shaped
      const raw: THREE.Vector2[] = [];
      let maxLen = 0;
      for (let i = 0; i < 96; i++) {
        const t = (i / 96) * Math.PI * 2;
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 6 * Math.cos(3 * t) - Math.cos(4 * t) + 2;
        raw.push(new THREE.Vector2(x, y));
        maxLen = Math.max(maxLen, Math.hypot(x, y));
      }
      return raw.map((p) => p.multiplyScalar(radius / maxLen));
    }
  }
}

/** Radius for nested loop i (0 = outermost). */
export function loopRadius(i: number, outerRadius: number): number {
  return outerRadius * Math.pow(0.74, i);
}

export function buildPath(kind: OutlineKind, loopIndex: number, outerRadius: number): OutlinePath {
  return new OutlinePath(outlinePoints(kind, loopRadius(loopIndex, outerRadius)));
}
