export interface HudOptions {
  levelName: string;
  backLabel: string;
  onBack: () => void;
  onRestart: () => void;
}

export class Hud {
  private root: HTMLDivElement;
  private modalEl: HTMLDivElement | null = null;

  constructor(private parent: HTMLElement, private opts: HudOptions) {
    this.root = document.createElement('div');
    this.root.className = 'overlay';
    this.root.innerHTML = `
      <div class="hud-top">
        <button class="btn ghost small" data-act="back">← ${opts.backLabel}</button>
        <div class="hud-counter"><strong>${opts.levelName}</strong></div>
        <button class="btn ghost small" data-act="restart">↻</button>
      </div>`;
    this.root.querySelector('[data-act="back"]')!.addEventListener('click', () => opts.onBack());
    this.root.querySelector('[data-act="restart"]')!.addEventListener('click', () => opts.onRestart());
    parent.appendChild(this.root);
  }

  showEnd(win: boolean) {
    if (this.modalEl) return;
    const m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = `
      <div class="modal-card endgame ${win ? 'win' : 'lose'}">
        <h1>${win ? 'Cleared!' : 'Stuck!'}</h1>
        <p>${win ? 'Every segment destroyed. Nice dispatching.' : 'No parked color can ever fire again.'}</p>
        <div class="modal-actions">
          <button class="btn ghost" data-act="back">← ${this.opts.backLabel}</button>
          <button class="btn" data-act="restart">${win ? 'Play again' : 'Retry'}</button>
        </div>
      </div>`;
    m.querySelector('[data-act="back"]')!.addEventListener('click', () => this.opts.onBack());
    m.querySelector('[data-act="restart"]')!.addEventListener('click', () => this.opts.onRestart());
    this.parent.appendChild(m);
    this.modalEl = m;
  }

  dispose() {
    this.modalEl?.remove();
    this.modalEl = null;
    this.root.remove();
  }
}
