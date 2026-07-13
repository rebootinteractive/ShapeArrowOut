import type { LevelData } from '../shared/types';
import { ALL_LEVELS } from '../levels';
import { deleteCustomLevel, loadCustomLevels } from './storage';

export interface MainMenuOptions {
  onPlay: (level: LevelData) => void;
  onOpenEditor: (level?: LevelData) => void;
}

export class MainMenu {
  private root: HTMLDivElement;

  constructor(parent: HTMLElement, private opts: MainMenuOptions) {
    this.root = document.createElement('div');
    this.root.className = 'menu';
    parent.appendChild(this.root);
    this.render();
  }

  private levelMeta(l: LevelData): string {
    const segs = l.loops.reduce((n, lp) => n + lp.segments.length, 0);
    return `${l.shape} · ${l.loops.length} loop${l.loops.length > 1 ? 's' : ''} · ${segs} segments · deck ${l.deckSlots}`;
  }

  private render() {
    this.root.innerHTML = `
      <div class="menu-title">Shape Arrow Out</div>
      <div class="menu-sub">Free the arrows, feed the shape, don't clog the deck.</div>
      <div class="menu-section-label">Levels</div>
      <div class="level-list" data-list="builtin"></div>
      <div class="menu-section-label" data-custom-label></div>
      <div class="level-list" data-list="custom"></div>
      <div class="menu-footer"><button class="btn" style="width:100%" data-act="new">+ Create New Level</button></div>
    `;

    const builtinList = this.root.querySelector('[data-list="builtin"]')!;
    for (const level of ALL_LEVELS) {
      builtinList.appendChild(this.levelCard(level, false));
    }

    const custom = loadCustomLevels();
    const label = this.root.querySelector('[data-custom-label]') as HTMLElement;
    const customList = this.root.querySelector('[data-list="custom"]') as HTMLElement;
    label.textContent = `Your Levels (${custom.length})`;
    if (custom.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:var(--muted);font-size:13px;opacity:.7';
      empty.textContent = 'No custom levels yet — create one in the editor.';
      customList.appendChild(empty);
    } else {
      for (const level of custom) customList.appendChild(this.levelCard(level, true));
    }

    this.root.querySelector('[data-act="new"]')!.addEventListener('click', () => this.opts.onOpenEditor());
  }

  private levelCard(level: LevelData, custom: boolean): HTMLDivElement {
    const card = document.createElement('div');
    card.className = 'level-card';
    card.innerHTML = `
      <div>
        <div class="name">${level.name}</div>
        <div class="meta">${this.levelMeta(level)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:4px">
        ${custom ? '<button class="btn ghost small" data-act="edit">Edit</button><button class="delete" data-act="delete">✕</button>' : ''}
      </div>`;
    card.addEventListener('click', () => this.opts.onPlay(level));
    if (custom) {
      card.querySelector('[data-act="edit"]')!.addEventListener('click', (e) => {
        e.stopPropagation();
        this.opts.onOpenEditor(level);
      });
      card.querySelector('[data-act="delete"]')!.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteCustomLevel(level.id);
        this.render();
      });
    }
    return card;
  }

  dispose() {
    this.root.remove();
  }
}
