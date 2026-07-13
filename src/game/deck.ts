import * as THREE from 'three';
import type { ColorKey } from '../shared/types';
import { COLOR_HEX } from '../shared/colors';
import { NumberLabel, easeInOut } from './util';
import type { DotState } from './shape';

const FIRE_INTERVAL = 0.11;
const RETRY_INTERVAL = 0.06;

interface DeckItem {
  color: ColorKey;
  remaining: number;
  inFlight: number;
  cooldown: number;
  state: 'incoming' | 'parked' | 'leaving';
  animT: number;
  from: THREE.Vector3;
  group: THREE.Group;
  body: THREE.Mesh;
  label: NumberLabel;
}

export interface DeckFireContext {
  requestDot(color: ColorKey): DotState | null;
  dotWorldPos(dot: DotState): THREE.Vector3;
  onArrowArrive(dot: DotState): void;
  spawnArrow(from: THREE.Vector3, color: ColorKey, getTarget: () => THREE.Vector3, onArrive: () => void): void;
}

export class Deck {
  private group = new THREE.Group();
  private slotPositions: THREE.Vector3[] = [];
  private items: (DeckItem | null)[] = [];
  private slotGeo: THREE.PlaneGeometry;
  private bodyGeo: THREE.BoxGeometry;
  private slotMat = new THREE.MeshBasicMaterial({ color: 0x232838 });
  readonly slotSize: number;

  constructor(private scene: THREE.Scene, readonly slots: number, centerY: number, worldWidth: number) {
    this.slotSize = Math.min(0.68, (worldWidth - 0.4) / slots - 0.1);
    const pitch = this.slotSize + 0.12;
    const x0 = -((slots - 1) * pitch) / 2;
    this.slotGeo = new THREE.PlaneGeometry(this.slotSize, this.slotSize);
    const b = this.slotSize * 0.86;
    this.bodyGeo = new THREE.BoxGeometry(b, b, 0.08);
    scene.add(this.group);
    for (let i = 0; i < slots; i++) {
      const pos = new THREE.Vector3(x0 + i * pitch, centerY, 0);
      this.slotPositions.push(pos);
      this.items.push(null);
      const slot = new THREE.Mesh(this.slotGeo, this.slotMat);
      slot.position.set(pos.x, pos.y, -0.04);
      this.group.add(slot);
    }
  }

  hasFreeSlot(): boolean {
    return this.items.some((i) => i === null);
  }

  slotsUsed(): number {
    return this.items.filter((i) => i !== null).length;
  }

  isFull(): boolean {
    return this.items.every((i) => i !== null);
  }

  hasTransient(): boolean {
    return this.items.some((i) => i && i.state !== 'parked');
  }

  anyInFlight(): boolean {
    return this.items.some((i) => i && i.inFlight > 0);
  }

  parkedColors(): ColorKey[] {
    const out: ColorKey[] = [];
    for (const i of this.items) if (i && i.state === 'parked' && i.remaining > 0) out.push(i.color);
    return out;
  }

  isIdle(): boolean {
    return !this.hasTransient() && !this.anyInFlight();
  }

  /** Reserve a slot and fly a new container in from the yard. False if full. */
  spawnIncoming(color: ColorKey, arrows: number, fromWorld: THREE.Vector3): boolean {
    const idx = this.items.findIndex((i) => i === null);
    if (idx < 0) return false;
    const group = new THREE.Group();
    const body = new THREE.Mesh(this.bodyGeo, new THREE.MeshBasicMaterial({ color: COLOR_HEX[color] }));
    const label = new NumberLabel(this.slotSize * 0.5);
    label.set(arrows);
    label.sprite.position.set(0, 0, 0.12);
    group.add(body, label.sprite);
    group.position.copy(fromWorld);
    group.position.z = 0.1;
    this.group.add(group);
    this.items[idx] = {
      color,
      remaining: arrows,
      inFlight: 0,
      cooldown: 0,
      state: 'incoming',
      animT: 0,
      from: fromWorld.clone(),
      group,
      body,
      label,
    };
    return true;
  }

  update(dt: number, ctx: DeckFireContext) {
    for (let idx = 0; idx < this.items.length; idx++) {
      const item = this.items[idx];
      if (!item) continue;
      const slotPos = this.slotPositions[idx];

      if (item.state === 'incoming') {
        item.animT += dt / 0.45;
        const t = Math.min(item.animT, 1);
        const e = easeInOut(t);
        item.group.position.lerpVectors(item.from, slotPos, e);
        item.group.position.y += Math.sin(t * Math.PI) * 0.35;
        item.group.position.z = 0.1;
        if (item.animT >= 1) {
          item.group.position.copy(slotPos);
          item.state = 'parked';
          item.cooldown = 0.1;
        }
        continue;
      }

      if (item.state === 'leaving') {
        item.animT += dt / 0.28;
        const t = Math.min(item.animT, 1);
        item.group.scale.setScalar(Math.max(1 - t, 0.0001));
        if (item.animT >= 1) {
          this.removeItemMesh(item);
          this.items[idx] = null;
        }
        continue;
      }

      // parked: auto-fire
      item.cooldown -= dt;
      if (item.cooldown <= 0 && item.remaining > 0) {
        const dot = ctx.requestDot(item.color);
        if (dot) {
          item.remaining--;
          item.inFlight++;
          item.label.set(item.remaining);
          ctx.spawnArrow(slotPos.clone(), item.color, () => ctx.dotWorldPos(dot), () => {
            ctx.onArrowArrive(dot);
            item.inFlight--;
          });
          item.cooldown = FIRE_INTERVAL;
        } else {
          item.cooldown = RETRY_INTERVAL;
        }
      }
      if (item.remaining <= 0 && item.inFlight === 0) {
        item.state = 'leaving';
        item.animT = 0;
      }
    }
  }

  private removeItemMesh(item: DeckItem) {
    (item.body.material as THREE.Material).dispose();
    item.label.dispose();
    this.group.remove(item.group);
  }

  dispose() {
    for (const item of this.items) {
      if (item) this.removeItemMesh(item);
    }
    this.items = [];
    this.slotGeo.dispose();
    this.bodyGeo.dispose();
    this.slotMat.dispose();
    this.scene.remove(this.group);
  }
}
