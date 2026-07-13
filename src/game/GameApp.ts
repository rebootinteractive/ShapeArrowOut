import * as THREE from 'three';
import type { LevelData } from '../shared/types';
import { ShapeSystem } from './shape';
import { Yard } from './yard';
import { Deck } from './deck';
import { ArrowSystem } from './arrows';
import { Hud } from './Hud';
import { loadSettings } from '../shared/settings';

export interface GameOptions {
  level: LevelData;
  backLabel?: string;
  onBack: () => void;
  onRestart: () => void;
}

// world layout (portrait)
const WORLD_W = 4.6;
const DECK_Y = 0.18;
const YARD_CENTER = new THREE.Vector2(0, -2.62);
const YARD_W = 4.3;
const YARD_H = 4.0;

export class GameApp {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private rafId = 0;
  private lastTime = 0;
  private shape: ShapeSystem;
  private yard: Yard;
  private deck: Deck;
  private arrows: ArrowSystem;
  private hud: Hud;
  private raycaster = new THREE.Raycaster();
  private resizeObserver: ResizeObserver;
  private ended = false;
  private winDelay = -1;
  private loseCheckTimer = 0;
  private pendingDispatch = 0;
  private worldH = 9.4;
  private onPointerDown = (ev: PointerEvent) => this.handleTap(ev);

  constructor(private parent: HTMLElement, private opts: GameOptions) {
    const level = opts.level;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.background = new THREE.Color(0x1c1f2a);
    parent.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(2.5, 4, 6);
    this.scene.add(sun, new THREE.AmbientLight(0xffffff, 0.85));

    // shape size comes from global settings; keep its window wedge clear of the deck
    const shapeR = loadSettings().shapeRadius;
    const shapeCenterY = 0.66 + 1.14 * shapeR;
    this.worldH = Math.max(9.4, 2 * (shapeCenterY + shapeR + 0.45));
    this.shape = new ShapeSystem(
      this.scene,
      { shape: level.shape, loops: level.loops, lapSeconds: level.lapSeconds },
      new THREE.Vector2(0, shapeCenterY),
      shapeR
    );
    this.yard = new Yard(
      this.scene,
      { gridCols: level.gridCols, gridRows: level.gridRows, containers: level.containers },
      YARD_CENTER,
      YARD_W,
      YARD_H
    );
    this.deck = new Deck(this.scene, level.deckSlots, DECK_Y, WORLD_W);
    this.arrows = new ArrowSystem(this.scene);

    this.hud = new Hud(parent, {
      levelName: level.name,
      backLabel: opts.backLabel ?? 'Levels',
      onBack: opts.onBack,
      onRestart: opts.onRestart,
    });

    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(parent);
    this.handleResize();

    this.lastTime = performance.now();
    const tick = (now: number) => {
      this.rafId = requestAnimationFrame(tick);
      const dt = Math.min((now - this.lastTime) / 1000, 0.05);
      this.lastTime = now;
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private handleResize() {
    const w = this.parent.clientWidth || 1;
    const h = this.parent.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const fovV = THREE.MathUtils.degToRad(this.camera.fov);
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * this.camera.aspect);
    const dV = (this.worldH / 2 + 0.2) / Math.tan(fovV / 2);
    const dH = (WORLD_W / 2 + 0.2) / Math.tan(fovH / 2);
    this.camera.position.set(0, 0, Math.max(dV, dH));
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }

  private handleTap(ev: PointerEvent) {
    if (this.ended) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.yard.pickMeshes(), false);
    if (!hits.length) return;
    const entry = hits[0].object.userData.entry;
    if (!entry || entry.state !== 'idle') return;

    if (!this.yard.canExit(entry)) {
      this.yard.bump(entry);
      return;
    }
    const freeSlots = this.deck.slots - this.deck.slotsUsed() - this.pendingDispatch;
    if (freeSlots <= 0) {
      this.yard.bump(entry);
      return;
    }
    this.pendingDispatch++;
    const { color, arrows } = entry;
    this.yard.dispatch(entry, (worldPos) => {
      this.pendingDispatch--;
      this.deck.spawnIncoming(color, arrows, worldPos);
    });
  }

  private update(dt: number) {
    this.shape.update(dt);
    this.yard.update(dt);
    this.arrows.update(dt);
    this.deck.update(dt, {
      requestDot: (color) => this.shape.requestDot(color),
      dotWorldPos: (dot) => this.shape.dotWorldPos(dot),
      onArrowArrive: (dot, obj, mats) => {
        this.shape.fillDot(dot);
        this.shape.plantArrow(dot, obj, mats);
      },
      spawnArrow: (from, color, getTarget, onArrive) => this.arrows.spawn(from, color, getTarget, onArrive),
    });

    if (this.ended) return;

    // win: everything destroyed
    if (this.shape.remainingSegments() === 0) {
      if (this.winDelay < 0) this.winDelay = 0.6;
      this.winDelay -= dt;
      if (this.winDelay <= 0) {
        this.ended = true;
        this.hud.showEnd(true);
      }
      return;
    }

    // lose: hard deadlock detection
    this.loseCheckTimer -= dt;
    if (this.loseCheckTimer <= 0) {
      this.loseCheckTimer = 0.4;
      const idle =
        this.arrows.inFlight() === 0 &&
        this.deck.isIdle() &&
        this.pendingDispatch === 0;
      if (idle) {
        const parked = this.deck.parkedColors();
        const anyFire = parked.some((c) => this.shape.hasFireableEver(c));
        if (!anyFire && (this.deck.isFull() || !this.yard.anyExitable())) {
          this.ended = true;
          this.hud.showEnd(false);
        }
      }
    }
  }

  dispose() {
    cancelAnimationFrame(this.rafId);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.resizeObserver.disconnect();
    this.shape.dispose();
    this.yard.dispose();
    this.deck.dispose();
    this.arrows.dispose();
    this.hud.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
