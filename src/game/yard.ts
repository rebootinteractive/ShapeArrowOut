import * as THREE from 'three';
import type { ColorKey, ContainerDef, Dir } from '../shared/types';
import { DIR_VEC } from '../shared/types';
import { COLOR_HEX } from '../shared/colors';
import { NumberLabel, arrowGlyphGeometry, easeOutCubic } from './util';

export interface YardConfig {
  gridCols: number;
  gridRows: number;
  containers: ContainerDef[];
}

export interface YardEntry {
  col: number;
  row: number;
  color: ColorKey;
  dir: Dir;
  arrows: number;
  group: THREE.Group;
  body: THREE.Mesh;
  glyph: THREE.Mesh;
  label: NumberLabel;
  state: 'idle' | 'sliding' | 'gone';
  animT: number;
  animFrom: THREE.Vector3;
  animTo: THREE.Vector3;
  animDur: number;
  bumpT: number;
  onOut?: (worldPos: THREE.Vector3) => void;
}

const DIR_ANGLE: Record<Dir, number> = {
  up: 0,
  left: Math.PI / 2,
  down: Math.PI,
  right: -Math.PI / 2,
};

export class Yard {
  private group = new THREE.Group();
  readonly cellSize: number;
  private originX: number;
  private originY: number;
  entries: YardEntry[] = [];
  private occupancy = new Map<string, YardEntry>();
  private tileMeshes: THREE.Mesh[] = [];
  private tileGeo: THREE.PlaneGeometry;
  private bodyGeo: THREE.BoxGeometry;
  private glyphGeo: THREE.ShapeGeometry;
  private tileMat = new THREE.MeshBasicMaterial({ color: 0x232838 });

  constructor(
    private scene: THREE.Scene,
    public cfg: YardConfig,
    areaCenter: THREE.Vector2,
    areaWidth: number,
    areaHeight: number
  ) {
    this.cellSize = Math.min(areaWidth / cfg.gridCols, areaHeight / cfg.gridRows, 0.64);
    this.originX = areaCenter.x - (cfg.gridCols * this.cellSize) / 2;
    this.originY = areaCenter.y + (cfg.gridRows * this.cellSize) / 2;
    this.tileGeo = new THREE.PlaneGeometry(this.cellSize * 0.94, this.cellSize * 0.94);
    const b = this.cellSize * 0.8;
    this.bodyGeo = new THREE.BoxGeometry(b, b, 0.08);
    this.glyphGeo = arrowGlyphGeometry();
    scene.add(this.group);

    for (let r = 0; r < cfg.gridRows; r++) {
      for (let c = 0; c < cfg.gridCols; c++) {
        const tile = new THREE.Mesh(this.tileGeo, this.tileMat);
        const p = this.cellToWorld(c, r);
        tile.position.set(p.x, p.y, -0.04);
        this.group.add(tile);
        this.tileMeshes.push(tile);
      }
    }

    for (const def of cfg.containers) this.addEntry(def);
  }

  cellToWorld(col: number, row: number): THREE.Vector3 {
    return new THREE.Vector3(
      this.originX + (col + 0.5) * this.cellSize,
      this.originY - (row + 0.5) * this.cellSize,
      0
    );
  }

  worldToCell(x: number, y: number): { col: number; row: number } {
    return {
      col: Math.floor((x - this.originX) / this.cellSize),
      row: Math.floor((this.originY - y) / this.cellSize),
    };
  }

  addEntry(def: ContainerDef): YardEntry {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshBasicMaterial({ color: COLOR_HEX[def.color] });
    const body = new THREE.Mesh(this.bodyGeo, bodyMat);
    const glyphMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    const glyph = new THREE.Mesh(this.glyphGeo, glyphMat);
    glyph.scale.setScalar(this.cellSize * 0.42);
    glyph.rotation.z = DIR_ANGLE[def.dir];
    glyph.position.z = 0.06;
    const label = new NumberLabel(this.cellSize * 0.42);
    label.set(def.arrows);
    label.sprite.position.set(this.cellSize * 0.26, this.cellSize * 0.26, 0.1);
    group.add(body, glyph, label.sprite);
    const p = this.cellToWorld(def.col, def.row);
    group.position.copy(p);
    this.group.add(group);

    const entry: YardEntry = {
      col: def.col,
      row: def.row,
      color: def.color,
      dir: def.dir,
      arrows: def.arrows,
      group,
      body,
      glyph,
      label,
      state: 'idle',
      animT: 0,
      animFrom: new THREE.Vector3(),
      animTo: new THREE.Vector3(),
      animDur: 1,
      bumpT: -1,
    };
    this.entries.push(entry);
    this.occupancy.set(`${def.col},${def.row}`, entry);
    return entry;
  }

  entryAt(col: number, row: number): YardEntry | undefined {
    return this.occupancy.get(`${col},${row}`);
  }

  /** Cells from the entry to the grid edge along its arrow, exclusive of its own cell. */
  private exitCells(entry: YardEntry): { col: number; row: number }[] {
    const v = DIR_VEC[entry.dir];
    const cells: { col: number; row: number }[] = [];
    let c = entry.col + v.dc;
    let r = entry.row + v.dr;
    while (c >= 0 && c < this.cfg.gridCols && r >= 0 && r < this.cfg.gridRows) {
      cells.push({ col: c, row: r });
      c += v.dc;
      r += v.dr;
    }
    return cells;
  }

  canExit(entry: YardEntry): boolean {
    return this.exitCells(entry).every((c) => !this.occupancy.get(`${c.col},${c.row}`));
  }

  anyExitable(): boolean {
    return this.entries.some((e) => e.state === 'idle' && this.canExit(e));
  }

  isEmpty(): boolean {
    return this.entries.every((e) => e.state === 'gone');
  }

  /** Slide the container out of the grid, then hand its world position to onOut. */
  dispatch(entry: YardEntry, onOut: (worldPos: THREE.Vector3) => void) {
    this.occupancy.delete(`${entry.col},${entry.row}`);
    const v = DIR_VEC[entry.dir];
    const steps = this.exitCells(entry).length + 1.4;
    entry.state = 'sliding';
    entry.animT = 0;
    entry.animFrom.copy(entry.group.position);
    entry.animTo.set(
      entry.group.position.x + v.dc * steps * this.cellSize,
      entry.group.position.y - v.dr * steps * this.cellSize,
      0
    );
    entry.animDur = 0.1 + steps * 0.05;
    entry.onOut = onOut;
  }

  bump(entry: YardEntry) {
    if (entry.state !== 'idle') return;
    entry.bumpT = 0;
  }

  pickMeshes(): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const e of this.entries) {
      if (e.state === 'idle') {
        e.body.userData.entry = e;
        out.push(e.body);
      }
    }
    return out;
  }

  update(dt: number) {
    for (const e of this.entries) {
      if (e.state === 'sliding') {
        e.animT += dt / e.animDur;
        const t = Math.min(e.animT, 1);
        e.group.position.lerpVectors(e.animFrom, e.animTo, easeOutCubic(t));
        if (e.animT >= 1) {
          e.state = 'gone';
          const pos = e.group.position.clone();
          this.removeEntryMesh(e);
          e.onOut?.(pos);
        }
      } else if (e.bumpT >= 0) {
        e.bumpT += dt / 0.2;
        const t = Math.min(e.bumpT, 1);
        const v = DIR_VEC[e.dir];
        const off = Math.sin(t * Math.PI) * this.cellSize * 0.12;
        const base = this.cellToWorld(e.col, e.row);
        e.group.position.set(base.x + v.dc * off, base.y - v.dr * off, 0);
        if (e.bumpT >= 1) {
          e.bumpT = -1;
          e.group.position.copy(base);
        }
      }
    }
  }

  removeEntry(entry: YardEntry) {
    this.occupancy.delete(`${entry.col},${entry.row}`);
    entry.state = 'gone';
    this.removeEntryMesh(entry);
    this.entries = this.entries.filter((e) => e !== entry);
  }

  private removeEntryMesh(e: YardEntry) {
    (e.body.material as THREE.Material).dispose();
    (e.glyph.material as THREE.Material).dispose();
    e.label.dispose();
    this.group.remove(e.group);
  }

  dispose() {
    for (const e of this.entries) {
      if (e.state !== 'gone') this.removeEntryMesh(e);
    }
    this.entries = [];
    this.occupancy.clear();
    this.tileGeo.dispose();
    this.bodyGeo.dispose();
    this.glyphGeo.dispose();
    this.tileMat.dispose();
    this.scene.remove(this.group);
  }
}
