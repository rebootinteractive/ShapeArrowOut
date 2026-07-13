import type { LevelData } from '../shared/types';

// Level 1 — tutorial-trivial: one ring, two colors, every container instantly free.
const level1: LevelData = {
  id: 'l1-first-lap',
  name: 'First Lap',
  shape: 'circle',
  loops: [
    {
      segments: [
        { color: 'red', dots: 6 },
        { color: 'blue', dots: 6 },
      ],
    },
  ],
  lapSeconds: 14,
  deckSlots: 2,
  arrowsPerContainer: 3,
  gridCols: 3,
  gridRows: 3,
  containers: [
    { col: 0, row: 0, color: 'red', dir: 'up', arrows: 3 },
    { col: 2, row: 0, color: 'red', dir: 'up', arrows: 3 },
    { col: 0, row: 2, color: 'blue', dir: 'down', arrows: 3 },
    { col: 2, row: 2, color: 'blue', dir: 'down', arrows: 3 },
  ],
};

// Level 2 — two synced rings, four colors, offset inner colors force peeling order.
const level2: LevelData = {
  id: 'l2-double-ring',
  name: 'Double Ring',
  shape: 'circle',
  loops: [
    {
      segments: [
        { color: 'red', dots: 6 },
        { color: 'blue', dots: 6 },
        { color: 'green', dots: 6 },
        { color: 'yellow', dots: 6 },
      ],
    },
    {
      segments: [
        { color: 'blue', dots: 6 },
        { color: 'green', dots: 6 },
        { color: 'yellow', dots: 6 },
        { color: 'red', dots: 6 },
      ],
    },
  ],
  lapSeconds: 12,
  deckSlots: 3,
  arrowsPerContainer: 4,
  gridCols: 4,
  gridRows: 4,
  containers: [
    { col: 1, row: 0, color: 'red', dir: 'up', arrows: 4 },
    { col: 2, row: 0, color: 'blue', dir: 'up', arrows: 4 },
    { col: 0, row: 1, color: 'red', dir: 'left', arrows: 4 },
    { col: 1, row: 1, color: 'blue', dir: 'left', arrows: 4 },
    { col: 2, row: 1, color: 'green', dir: 'right', arrows: 4 },
    { col: 3, row: 1, color: 'yellow', dir: 'right', arrows: 4 },
    { col: 0, row: 2, color: 'blue', dir: 'left', arrows: 4 },
    { col: 1, row: 2, color: 'green', dir: 'left', arrows: 4 },
    { col: 2, row: 2, color: 'yellow', dir: 'right', arrows: 4 },
    { col: 3, row: 2, color: 'red', dir: 'right', arrows: 4 },
    { col: 1, row: 3, color: 'green', dir: 'down', arrows: 4 },
    { col: 2, row: 3, color: 'yellow', dir: 'down', arrows: 4 },
  ],
};

// Level 3 — star conveyor, five colors, inner ring offset by two segments.
const level3: LevelData = {
  id: 'l3-star-peel',
  name: 'Star Peel',
  shape: 'star',
  loops: [
    {
      segments: [
        { color: 'red', dots: 8 },
        { color: 'blue', dots: 8 },
        { color: 'green', dots: 8 },
        { color: 'yellow', dots: 8 },
        { color: 'purple', dots: 8 },
      ],
    },
    {
      segments: [
        { color: 'green', dots: 4 },
        { color: 'yellow', dots: 4 },
        { color: 'purple', dots: 4 },
        { color: 'red', dots: 4 },
        { color: 'blue', dots: 4 },
      ],
    },
  ],
  lapSeconds: 10,
  deckSlots: 3,
  arrowsPerContainer: 4,
  gridCols: 5,
  gridRows: 5,
  containers: [
    { col: 1, row: 0, color: 'purple', dir: 'up', arrows: 4 },
    { col: 3, row: 0, color: 'red', dir: 'up', arrows: 4 },
    { col: 0, row: 1, color: 'green', dir: 'left', arrows: 4 },
    { col: 1, row: 1, color: 'red', dir: 'up', arrows: 4 },
    { col: 2, row: 1, color: 'blue', dir: 'up', arrows: 4 },
    { col: 3, row: 1, color: 'green', dir: 'up', arrows: 4 },
    { col: 4, row: 1, color: 'yellow', dir: 'right', arrows: 4 },
    { col: 0, row: 2, color: 'blue', dir: 'left', arrows: 4 },
    { col: 1, row: 2, color: 'yellow', dir: 'left', arrows: 4 },
    { col: 2, row: 2, color: 'purple', dir: 'down', arrows: 4 },
    { col: 3, row: 2, color: 'blue', dir: 'right', arrows: 4 },
    { col: 1, row: 3, color: 'yellow', dir: 'down', arrows: 4 },
    { col: 2, row: 3, color: 'green', dir: 'down', arrows: 4 },
    { col: 3, row: 3, color: 'red', dir: 'right', arrows: 4 },
    { col: 3, row: 4, color: 'purple', dir: 'down', arrows: 4 },
  ],
};

export const BUILTIN_LEVELS: LevelData[] = [level1, level2, level3];
