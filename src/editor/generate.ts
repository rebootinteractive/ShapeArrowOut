import type {
  ColorKey,
  ContainerDef,
  Dir,
  DotMode,
  LoopDef,
  OutlineKind,
  SegmentDef,
} from '../shared/types';
import { DIRS, DIR_VEC } from '../shared/types';
import { COLOR_KEYS } from '../shared/colors';
import { loopPerimeter } from '../game/outline';

export interface DemandParams {
  shape: OutlineKind;
  loopCount: number;
  segmentsPerLoop: number;
  colorsUsed: number;
  dotMode: DotMode;
  dotsPerSegment: number;
  dotDensity: number; // dots per world-unit of segment length (proportional mode)
}

const SHAPE_RADIUS = 1.58; // matches GameApp so proportional lengths are the real ones

export function buildLoops(p: DemandParams): LoopDef[] {
  const loops: LoopDef[] = [];
  for (let li = 0; li < p.loopCount; li++) {
    let dots = p.dotsPerSegment;
    if (p.dotMode === 'proportional') {
      const perimeter = loopPerimeter(p.shape, li, p.loopCount, SHAPE_RADIUS);
      const segLen = perimeter / p.segmentsPerLoop;
      dots = Math.max(2, Math.round(segLen * p.dotDensity));
    }
    const segs: SegmentDef[] = [];
    for (let si = 0; si < p.segmentsPerLoop; si++) {
      // cycle palette, offset per loop so inner colors sit behind different outer colors
      const color = COLOR_KEYS[(si + li) % p.colorsUsed];
      segs.push({ color, dots });
    }
    loops.push({ segments: segs });
  }
  return loops;
}

export function demandByColor(loops: LoopDef[]): Map<ColorKey, number> {
  const m = new Map<ColorKey, number>();
  for (const loop of loops)
    for (const seg of loop.segments) m.set(seg.color, (m.get(seg.color) ?? 0) + seg.dots);
  return m;
}

export function supplyByColor(containers: ContainerDef[]): Map<ColorKey, number> {
  const m = new Map<ColorKey, number>();
  for (const c of containers) m.set(c.color, (m.get(c.color) ?? 0) + c.arrows);
  return m;
}

/**
 * Containers in dispatch order: walk segments outer loop → inner, filling an open
 * container per color; the order containers first appear ≈ the order they're needed.
 * The last container of a color may hold fewer than capacity.
 */
export function buildDispatchList(
  loops: LoopDef[],
  capacity: number
): { color: ColorKey; arrows: number }[] {
  const order: { color: ColorKey; arrows: number }[] = [];
  const open = new Map<ColorKey, { color: ColorKey; arrows: number }>();
  for (const loop of loops) {
    for (const seg of loop.segments) {
      let need = seg.dots;
      while (need > 0) {
        let cur = open.get(seg.color);
        if (!cur) {
          cur = { color: seg.color, arrows: 0 };
          open.set(seg.color, cur);
          order.push(cur);
        }
        const take = Math.min(capacity - cur.arrows, need);
        cur.arrows += take;
        need -= take;
        if (cur.arrows >= capacity) open.delete(seg.color);
      }
    }
  }
  return order;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rayFree(
  col: number,
  row: number,
  dir: Dir,
  occupied: Set<string>,
  cols: number,
  rows: number
): boolean {
  const v = DIR_VEC[dir];
  let c = col + v.dc;
  let r = row + v.dr;
  while (c >= 0 && c < cols && r >= 0 && r < rows) {
    if (occupied.has(`${c},${r}`)) return false;
    c += v.dc;
    r += v.dr;
  }
  return true;
}

/**
 * Reverse construction: insert containers in REVERSE dispatch order; each inserted
 * piece must have a clear exit ray past the pieces already inserted. Tapping in
 * dispatch order is then a valid extraction, so the yard is solvable by build.
 */
export function placeContainers(
  dispatch: { color: ColorKey; arrows: number }[],
  cols: number,
  rows: number,
  seed = 1337
): ContainerDef[] | null {
  const rnd = mulberry32(seed);
  for (let attempt = 0; attempt < 80; attempt++) {
    const occupied = new Set<string>();
    const placed: ContainerDef[] = [];
    let ok = true;
    for (let i = dispatch.length - 1; i >= 0; i--) {
      const item = dispatch[i];
      // candidate cells: free ones, center-biased with jitter (first inserted = deepest)
      const cells: { col: number; row: number; score: number }[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (occupied.has(`${c},${r}`)) continue;
          const dx = c - (cols - 1) / 2;
          const dy = r - (rows - 1) / 2;
          cells.push({ col: c, row: r, score: Math.hypot(dx, dy) + rnd() * 2.2 });
        }
      }
      cells.sort((a, b) => a.score - b.score);
      let done = false;
      for (const cell of cells) {
        const dirs = [...DIRS].sort(() => rnd() - 0.5);
        for (const dir of dirs) {
          if (rayFree(cell.col, cell.row, dir, occupied, cols, rows)) {
            occupied.add(`${cell.col},${cell.row}`);
            placed.push({ col: cell.col, row: cell.row, color: item.color, dir, arrows: item.arrows });
            done = true;
            break;
          }
        }
        if (done) break;
      }
      if (!done) {
        ok = false;
        break;
      }
    }
    if (ok) return placed;
  }
  return null;
}

/** Greedy any-order removal decides extractability exactly (removals only unblock). */
export function isExtractable(containers: ContainerDef[], cols: number, rows: number): boolean {
  const occupied = new Set(containers.map((c) => `${c.col},${c.row}`));
  let remaining = [...containers];
  let progress = true;
  while (remaining.length > 0 && progress) {
    progress = false;
    remaining = remaining.filter((c) => {
      if (rayFree(c.col, c.row, c.dir, occupied, cols, rows)) {
        occupied.delete(`${c.col},${c.row}`);
        progress = true;
        return false;
      }
      return true;
    });
  }
  return remaining.length === 0;
}
