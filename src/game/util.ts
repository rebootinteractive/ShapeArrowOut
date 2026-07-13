import * as THREE from 'three';

/** Arrow glyph (stem + head) pointing +Y, roughly 1×1 before scaling. */
export function arrowGlyphGeometry(): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0.5);
  s.lineTo(-0.34, 0.08);
  s.lineTo(-0.13, 0.08);
  s.lineTo(-0.13, -0.5);
  s.lineTo(0.13, -0.5);
  s.lineTo(0.13, 0.08);
  s.lineTo(0.34, 0.08);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

/** Canvas-backed number badge. Owns its texture/material — dispose per instance. */
export class NumberLabel {
  readonly sprite: THREE.Sprite;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private last = -1;

  constructor(scale: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 96;
    this.canvas.height = 96;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    const mat = new THREE.SpriteMaterial({ map: this.texture, depthTest: false });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.scale.setScalar(scale);
    this.sprite.renderOrder = 5;
  }

  set(n: number) {
    if (n === this.last) return;
    this.last = n;
    const c = this.ctx;
    c.clearRect(0, 0, 96, 96);
    c.font = '700 54px -apple-system, "Segoe UI", Roboto, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 10;
    c.strokeStyle = 'rgba(13,15,21,0.85)';
    c.strokeText(String(n), 48, 52);
    c.fillStyle = '#ffffff';
    c.fillText(String(n), 48, 52);
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
    this.sprite.material.dispose();
  }
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
