import * as THREE from 'three';
import type { ColorKey, ContainerDef, LevelData } from '../shared/types';
import { DIRS } from '../shared/types';
import { COLOR_CSS, COLOR_KEYS } from '../shared/colors';
import { ShapeSystem } from '../game/shape';
import { Yard } from '../game/yard';
import { saveCustomLevel } from '../ui/storage';
import {
  DemandParams,
  buildDispatchList,
  buildLoops,
  demandByColor,
  isExtractable,
  placeContainers,
  supplyByColor,
} from './generate';

export interface EditorOptions {
  initial?: LevelData;
  onExit: () => void;
  onTestPlay: (level: LevelData) => void;
}

type Stage = 1 | 2;
type Tool = 'rotate' | 'paint' | 'erase';

const SHAPE_NAMES = ['circle', 'square', 'triangle', 'hexagon', 'star'] as const;
const SHAPE_ICONS: Record<string, string> = {
  circle: '○ Circle',
  square: '□ Square',
  triangle: '△ Triangle',
  hexagon: '⬡ Hexagon',
  star: '✦ Star',
};

export class EditorApp {
  private root: HTMLDivElement;
  private canvasWrap: HTMLDivElement;
  private statusEl: HTMLDivElement;
  private bottomEl: HTMLDivElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private rafId = 0;
  private lastTime = 0;
  private resizeObserver: ResizeObserver;
  private modalEl: HTMLDivElement | null = null;
  private flashTimer = 0;

  private stage: Stage = 1;
  private tool: Tool = 'rotate';
  private selColor: ColorKey = 'red';

  private params: DemandParams = {
    shape: 'circle',
    loopCount: 2,
    segmentsPerLoop: 4,
    colorsUsed: 4,
    dotMode: 'fixed',
    dotsPerSegment: 6,
    dotDensity: 3,
  };
  private lapSeconds = 12;
  private deckSlots = 3;
  private capacity = 4;
  private gridCols = 4;
  private gridRows = 4;
  private containers: ContainerDef[] = [];
  private name: string;
  private id: string;
  private seed = 1;

  private shapePreview: ShapeSystem | null = null;
  private yardPreview: Yard | null = null;
  private onPointerDown = (ev: PointerEvent) => this.handleTap(ev);

  constructor(private parent: HTMLElement, private opts: EditorOptions) {
    const init = opts.initial;
    this.id = init?.id ?? `custom-${Date.now()}`;
    this.name = init?.name ?? 'My Level';
    if (init) {
      this.lapSeconds = init.lapSeconds;
      this.deckSlots = init.deckSlots;
      this.capacity = init.arrowsPerContainer;
      this.gridCols = init.gridCols;
      this.gridRows = init.gridRows;
      this.containers = init.containers.map((c) => ({ ...c }));
      if (init.editorMeta) {
        this.params = {
          shape: init.shape,
          loopCount: init.loops.length,
          segmentsPerLoop: init.editorMeta.segmentsPerLoop,
          colorsUsed: init.editorMeta.colorsUsed,
          dotMode: init.editorMeta.dotMode,
          dotsPerSegment: init.editorMeta.dotsPerSegment,
          dotDensity: init.editorMeta.dotDensity,
        };
      } else {
        const colors = new Set<ColorKey>();
        init.loops.forEach((l) => l.segments.forEach((s) => colors.add(s.color)));
        this.params = {
          shape: init.shape,
          loopCount: init.loops.length,
          segmentsPerLoop: init.loops[0]?.segments.length ?? 4,
          colorsUsed: Math.max(colors.size, 2),
          dotMode: 'fixed',
          dotsPerSegment: init.loops[0]?.segments[0]?.dots ?? 6,
          dotDensity: 3,
        };
      }
    }

    this.root = document.createElement('div');
    this.root.className = 'overlay';
    this.root.style.background = 'var(--bg)';
    this.root.innerHTML = `
      <div class="editor-toolbar">
        <button class="tool-btn" data-stage="1">1 · Shape</button>
        <button class="tool-btn" data-stage="2">2 · Yard</button>
        <span style="flex:1"></span>
        <button class="tool-btn" data-act="menu">← Menu</button>
      </div>
      <div class="editor-status"></div>
      <div style="flex:1;position:relative;min-height:0" data-canvas></div>
      <div class="editor-bottom"></div>
    `;
    parent.appendChild(this.root);
    this.canvasWrap = this.root.querySelector('[data-canvas]')!;
    this.statusEl = this.root.querySelector('.editor-status')!;
    this.bottomEl = this.root.querySelector('.editor-bottom')!;

    this.root.querySelectorAll('[data-stage]').forEach((b) =>
      b.addEventListener('click', () => this.setStage(Number((b as HTMLElement).dataset.stage) as Stage))
    );
    this.root.querySelector('[data-act="menu"]')!.addEventListener('click', () => opts.onExit());

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.background = new THREE.Color(0x1c1f2a);
    this.canvasWrap.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.canvasWrap);

    this.setStage(init && this.containers.length > 0 ? 2 : 1);
    this.handleResize();

    this.lastTime = performance.now();
    const tick = (now: number) => {
      this.rafId = requestAnimationFrame(tick);
      const dt = Math.min((now - this.lastTime) / 1000, 0.05);
      this.lastTime = now;
      this.shapePreview?.update(dt);
      this.yardPreview?.update(dt);
      this.renderer.render(this.scene, this.camera);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  // ------------------------------------------------------------- stage switch

  private setStage(stage: Stage) {
    this.stage = stage;
    this.root.querySelectorAll('[data-stage]').forEach((b) => {
      b.classList.toggle('active', (b as HTMLElement).dataset.stage === String(stage));
    });
    this.clearPreviews();
    if (stage === 1) {
      this.buildStage1Controls();
      this.rebuildShapePreview();
    } else {
      if (this.containers.length === 0) this.redistribute();
      this.buildStage2Controls();
      this.rebuildYardPreview();
    }
    this.updateStatus();
    this.fitCamera();
  }

  private clearPreviews() {
    this.shapePreview?.dispose();
    this.shapePreview = null;
    this.yardPreview?.dispose();
    this.yardPreview = null;
  }

  private rebuildShapePreview() {
    this.shapePreview?.dispose();
    this.shapePreview = new ShapeSystem(
      this.scene,
      { shape: this.params.shape, loops: buildLoops(this.params), lapSeconds: this.lapSeconds },
      new THREE.Vector2(0, 0),
      1.58
    );
  }

  private rebuildYardPreview() {
    this.yardPreview?.dispose();
    this.yardPreview = new Yard(
      this.scene,
      { gridCols: this.gridCols, gridRows: this.gridRows, containers: this.containers },
      new THREE.Vector2(0, 0),
      4.4,
      4.4
    );
    this.fitCamera();
  }

  // ------------------------------------------------------------- camera

  private fitCamera() {
    const rect = { w: 4.4, h: 4.4 };
    const fovV = THREE.MathUtils.degToRad(this.camera.fov);
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * this.camera.aspect);
    const d = Math.max((rect.h / 2 + 0.3) / Math.tan(fovV / 2), (rect.w / 2 + 0.3) / Math.tan(fovH / 2));
    this.camera.position.set(0, 0, d);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }

  private handleResize() {
    const w = this.canvasWrap.clientWidth || 1;
    const h = this.canvasWrap.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.fitCamera();
  }

  // ------------------------------------------------------------- controls

  private field(label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void): HTMLElement {
    const wrap = document.createElement('label');
    wrap.className = 'editor-field';
    wrap.innerHTML = `<span>${label}</span><input type="number" min="${min}" max="${max}" step="${step}" value="${value}">`;
    const input = wrap.querySelector('input')!;
    input.addEventListener('change', () => {
      const v = Math.min(max, Math.max(min, Number(input.value) || min));
      input.value = String(v);
      onChange(v);
    });
    return wrap;
  }

  private toolButton(label: string, active: boolean, onClick: (btn: HTMLButtonElement) => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'tool-btn' + (active ? ' active' : '');
    b.textContent = label;
    b.addEventListener('click', () => onClick(b));
    return b;
  }

  private buildStage1Controls() {
    this.bottomEl.innerHTML = '';
    const shapeRow = document.createElement('div');
    shapeRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;width:100%';
    for (const kind of SHAPE_NAMES) {
      shapeRow.appendChild(
        this.toolButton(SHAPE_ICONS[kind], this.params.shape === kind, () => {
          this.params.shape = kind;
          this.buildStage1Controls();
          this.rebuildShapePreview();
          this.updateStatus();
        })
      );
    }
    this.bottomEl.appendChild(shapeRow);

    const p = this.params;
    const refresh = () => {
      this.rebuildShapePreview();
      this.updateStatus();
    };
    this.bottomEl.appendChild(this.field('loops', p.loopCount, 1, 4, 1, (v) => ((p.loopCount = v), refresh())));
    this.bottomEl.appendChild(this.field('segs/loop', p.segmentsPerLoop, 2, 8, 1, (v) => ((p.segmentsPerLoop = v), refresh())));
    this.bottomEl.appendChild(this.field('colors', p.colorsUsed, 2, 5, 1, (v) => ((p.colorsUsed = v), refresh())));

    const modeRow = document.createElement('div');
    modeRow.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;width:100%';
    modeRow.appendChild(
      this.toolButton('Fixed dots', p.dotMode === 'fixed', () => {
        p.dotMode = 'fixed';
        this.buildStage1Controls();
        refresh();
      })
    );
    modeRow.appendChild(
      this.toolButton('Proportional', p.dotMode === 'proportional', () => {
        p.dotMode = 'proportional';
        this.buildStage1Controls();
        refresh();
      })
    );
    if (p.dotMode === 'fixed') {
      modeRow.appendChild(this.field('dots/seg', p.dotsPerSegment, 2, 30, 1, (v) => ((p.dotsPerSegment = v), refresh())));
    } else {
      modeRow.appendChild(this.field('density', p.dotDensity, 0.5, 10, 0.5, (v) => ((p.dotDensity = v), refresh())));
    }
    this.bottomEl.appendChild(modeRow);

    this.bottomEl.appendChild(this.field('lap s', this.lapSeconds, 3, 60, 1, (v) => ((this.lapSeconds = v), this.rebuildShapePreview())));
    this.bottomEl.appendChild(this.field('deck', this.deckSlots, 1, 6, 1, (v) => ((this.deckSlots = v), this.updateStatus())));
    this.bottomEl.appendChild(this.field('arrows/box', this.capacity, 1, 20, 1, (v) => ((this.capacity = v), this.updateStatus())));

    const next = document.createElement('button');
    next.className = 'btn small';
    next.textContent = 'Next: Distribute →';
    next.style.marginLeft = 'auto';
    next.addEventListener('click', () => {
      this.containers = [];
      this.setStage(2);
    });
    this.bottomEl.appendChild(next);
  }

  private buildStage2Controls() {
    this.bottomEl.innerHTML = '';

    const toolRow = document.createElement('div');
    toolRow.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;width:100%';
    const tools: { key: Tool; label: string }[] = [
      { key: 'rotate', label: '↻ Rotate' },
      { key: 'paint', label: '🖌 Paint' },
      { key: 'erase', label: '⌫ Erase' },
    ];
    for (const t of tools) {
      toolRow.appendChild(
        this.toolButton(t.label, this.tool === t.key, () => {
          this.tool = t.key;
          this.buildStage2Controls();
        })
      );
    }
    const colorRow = document.createElement('div');
    colorRow.className = 'color-row';
    for (const key of COLOR_KEYS.slice(0, this.params.colorsUsed)) {
      const dot = document.createElement('div');
      dot.className = 'color-dot' + (this.selColor === key ? ' active' : '');
      dot.style.background = COLOR_CSS[key];
      dot.addEventListener('click', () => {
        this.selColor = key;
        this.buildStage2Controls();
      });
      colorRow.appendChild(dot);
    }
    toolRow.appendChild(colorRow);
    const redis = document.createElement('button');
    redis.className = 'tool-btn';
    redis.textContent = '⟳ Redistribute';
    redis.addEventListener('click', () => {
      this.seed++;
      this.redistribute();
      this.rebuildYardPreview();
      this.updateStatus();
    });
    toolRow.appendChild(redis);
    this.bottomEl.appendChild(toolRow);

    this.bottomEl.appendChild(this.field('cols', this.gridCols, 2, 8, 1, (v) => {
      this.gridCols = v;
      this.containers = this.containers.filter((c) => c.col < v);
      this.rebuildYardPreview();
      this.updateStatus();
    }));
    this.bottomEl.appendChild(this.field('rows', this.gridRows, 2, 8, 1, (v) => {
      this.gridRows = v;
      this.containers = this.containers.filter((c) => c.row < v);
      this.rebuildYardPreview();
      this.updateStatus();
    }));

    const nameWrap = document.createElement('label');
    nameWrap.className = 'editor-field';
    nameWrap.innerHTML = `<span>name</span><input class="wide" type="text" value="${this.name.replace(/"/g, '&quot;')}">`;
    nameWrap.querySelector('input')!.addEventListener('change', (e) => {
      this.name = (e.target as HTMLInputElement).value || 'My Level';
    });
    this.bottomEl.appendChild(nameWrap);

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;width:100%';
    const mk = (label: string, cls: string, fn: () => void) => {
      const b = document.createElement('button');
      b.className = `btn small ${cls}`;
      b.textContent = label;
      b.addEventListener('click', fn);
      actions.appendChild(b);
    };
    mk('▶ Test', '', () => this.opts.onTestPlay(this.snapshot()));
    mk('Copy JSON', 'ghost', () => this.showJsonModal());
    mk('↓ Download', 'ghost', () => this.downloadJson());
    mk('💾 Save', 'ghost', () => {
      saveCustomLevel(this.snapshot());
      this.flashStatus('Saved to Your Levels.');
    });
    this.bottomEl.appendChild(actions);
  }

  // ------------------------------------------------------------- distribution

  private redistribute() {
    const loops = buildLoops(this.params);
    const dispatch = buildDispatchList(loops, this.capacity);
    // grow the grid until the containers fit with a little slack
    while (this.gridCols * this.gridRows < dispatch.length && (this.gridCols < 8 || this.gridRows < 8)) {
      if (this.gridCols <= this.gridRows && this.gridCols < 8) this.gridCols++;
      else this.gridRows++;
    }
    if (this.gridCols * this.gridRows < dispatch.length) {
      this.flashStatus(`⚠ ${dispatch.length} containers don't fit even in 8×8 — reduce dots or raise capacity.`);
      return;
    }
    const placed = placeContainers(dispatch, this.gridCols, this.gridRows, this.seed * 7919 + 17);
    if (!placed) {
      this.flashStatus('⚠ Could not find a solvable layout — try a bigger grid or Redistribute again.');
      return;
    }
    this.containers = placed;
  }

  // ------------------------------------------------------------- editing taps

  private handleTap(ev: PointerEvent) {
    if (this.stage !== 2 || !this.yardPreview) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit)) return;
    const { col, row } = this.yardPreview.worldToCell(hit.x, hit.y);
    if (col < 0 || col >= this.gridCols || row < 0 || row >= this.gridRows) return;

    const existing = this.containers.find((c) => c.col === col && c.row === row);
    if (this.tool === 'rotate' && existing) {
      existing.dir = DIRS[(DIRS.indexOf(existing.dir) + 1) % DIRS.length];
    } else if (this.tool === 'paint') {
      if (existing) existing.color = this.selColor;
      else this.containers.push({ col, row, color: this.selColor, dir: 'up', arrows: this.capacity });
    } else if (this.tool === 'erase' && existing) {
      this.containers = this.containers.filter((c) => c !== existing);
    } else {
      return;
    }
    this.rebuildYardPreview();
    this.updateStatus();
  }

  // ------------------------------------------------------------- status

  private updateStatus() {
    window.clearTimeout(this.flashTimer);
    const loops = buildLoops(this.params);
    const demand = demandByColor(loops);
    if (this.stage === 1) {
      const total = [...demand.values()].reduce((a, b) => a + b, 0);
      const boxes = buildDispatchList(loops, this.capacity).length;
      const parts = [...demand.entries()]
        .map(([c, n]) => `<b style="color:${COLOR_CSS[c]}">${n}</b>`)
        .join(' · ');
      this.statusEl.innerHTML = `${total} dots (${parts}) → ${boxes} containers · deck ${this.deckSlots} · lap ${this.lapSeconds}s`;
      return;
    }
    const supply = supplyByColor(this.containers);
    const colors = new Set<ColorKey>([...demand.keys(), ...supply.keys()]);
    const parts: string[] = [];
    let balanced = true;
    for (const c of colors) {
      const d = demand.get(c) ?? 0;
      const s = supply.get(c) ?? 0;
      if (s !== d) balanced = false;
      parts.push(`<b style="color:${COLOR_CSS[c]}">${s}/${d}${s !== d ? '⚠' : ''}</b>`);
    }
    const extractable = isExtractable(this.containers, this.gridCols, this.gridRows);
    this.statusEl.innerHTML =
      `arrows/dots: ${parts.join(' · ')} · ` +
      (extractable ? 'all containers can exit ✓' : '<b style="color:var(--danger)">some containers can never exit ⚠</b>') +
      (balanced ? '' : ' · <b style="color:var(--warn)">unbalanced</b>');
  }

  private flashStatus(msg: string) {
    this.statusEl.textContent = msg;
    window.clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => this.updateStatus(), 3500);
  }

  // ------------------------------------------------------------- output

  private snapshot(): LevelData {
    return {
      id: this.id,
      name: this.name,
      shape: this.params.shape,
      loops: buildLoops(this.params),
      lapSeconds: this.lapSeconds,
      deckSlots: this.deckSlots,
      arrowsPerContainer: this.capacity,
      gridCols: this.gridCols,
      gridRows: this.gridRows,
      containers: this.containers.map((c) => ({ ...c })),
      editorMeta: {
        segmentsPerLoop: this.params.segmentsPerLoop,
        colorsUsed: this.params.colorsUsed,
        dotMode: this.params.dotMode,
        dotsPerSegment: this.params.dotsPerSegment,
        dotDensity: this.params.dotDensity,
      },
    };
  }

  private showJsonModal() {
    const json = JSON.stringify(this.snapshot(), null, 2);
    const m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = `
      <div class="modal-card">
        <h2>Level JSON</h2>
        <p>Copy this, or use ↓ Download and drop the file into src/levels/contributed/.</p>
        <textarea class="json" readonly></textarea>
        <div class="modal-actions" style="margin-top:12px">
          <button class="btn ghost" data-act="close">Close</button>
          <button class="btn" data-act="copy">Copy</button>
        </div>
      </div>`;
    (m.querySelector('textarea') as HTMLTextAreaElement).value = json;
    m.querySelector('[data-act="close"]')!.addEventListener('click', () => {
      m.remove();
      this.modalEl = null;
    });
    m.querySelector('[data-act="copy"]')!.addEventListener('click', () => {
      navigator.clipboard?.writeText(json);
      this.flashStatus('JSON copied to clipboard.');
      m.remove();
      this.modalEl = null;
    });
    this.root.appendChild(m);
    this.modalEl = m;
  }

  private downloadJson() {
    const lv = this.snapshot();
    const json = JSON.stringify(lv, null, 2);
    const slug =
      (lv.name || lv.id || 'level').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'level';
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.flashStatus('Downloaded — drop into src/levels/contributed/ to ship it.');
  }

  dispose() {
    cancelAnimationFrame(this.rafId);
    window.clearTimeout(this.flashTimer);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.resizeObserver.disconnect();
    this.clearPreviews();
    this.modalEl?.remove();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.root.remove();
  }
}
