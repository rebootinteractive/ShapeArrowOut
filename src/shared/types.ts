export type ColorKey = 'red' | 'blue' | 'green' | 'yellow' | 'purple';

export type Dir = 'up' | 'down' | 'left' | 'right';

export type OutlineKind = 'circle' | 'square' | 'triangle' | 'hexagon' | 'star' | 'heart';

export type DotMode = 'fixed' | 'proportional';

export interface SegmentDef {
  color: ColorKey;
  dots: number;
}

/** One closed conveyor loop. Index 0 in LevelData.loops is the outermost. */
export interface LoopDef {
  segments: SegmentDef[];
}

export interface ContainerDef {
  col: number;
  row: number;
  color: ColorKey;
  dir: Dir;
  arrows: number;
}

/** Stage-1 editor parameters, kept so a saved level can be re-edited. */
export interface EditorMeta {
  segmentsPerLoop: number;
  colorsUsed: number;
  dotMode: DotMode;
  dotsPerSegment: number;
  dotDensity: number;
}

export interface LevelData {
  id: string;
  name: string;
  shape: OutlineKind;
  loops: LoopDef[];
  lapSeconds: number;
  deckSlots: number;
  arrowsPerContainer: number;
  gridCols: number;
  gridRows: number;
  containers: ContainerDef[];
  editorMeta?: EditorMeta;
}

export const DIRS: Dir[] = ['up', 'right', 'down', 'left'];

export const DIR_VEC: Record<Dir, { dc: number; dr: number }> = {
  up: { dc: 0, dr: -1 },
  down: { dc: 0, dr: 1 },
  left: { dc: -1, dr: 0 },
  right: { dc: 1, dr: 0 },
};
