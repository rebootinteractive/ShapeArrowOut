import type { LevelData } from '../shared/types';
import { ALL_LEVELS } from '../levels';
import { deleteCustomLevel, loadCustomLevels } from './storage';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../shared/settings';

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
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div class="menu-title">Shape Arrow Out</div>
        <button class="btn ghost small" data-act="settings">⚙</button>
      </div>
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
    this.root.querySelector('[data-act="settings"]')!.addEventListener('click', () => this.showSettings());
  }

  private showSettings() {
    const s = loadSettings();
    const m = document.createElement('div');
    m.className = 'modal';
    const slider = (
      label: string,
      key: 'shapeRadius' | 'tiltDeg',
      min: number,
      max: number,
      step: number,
      unit: string
    ) => `
      <div style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
          <span>${label}</span>
          <span style="color:var(--muted)" data-val="${key}">${s[key]}${unit}</span>
        </div>
        <input type="range" style="width:100%" min="${min}" max="${max}" step="${step}" value="${s[key]}" data-set="${key}" data-unit="${unit}">
      </div>`;
    m.innerHTML = `
      <div class="modal-card">
        <h2>Settings</h2>
        <p>Applies the next time a level or the editor opens.</p>
        ${slider('Shape size', 'shapeRadius', 1.3, 2.2, 0.05, '')}
        ${slider('Pie tilt', 'tiltDeg', 10, 50, 1, '°')}
        <div class="modal-actions">
          <button class="btn ghost" data-act="reset">Reset</button>
          <button class="btn" data-act="close">Done</button>
        </div>
      </div>`;
    const sync = () => {
      m.querySelectorAll('input[data-set]').forEach((el) => {
        const input = el as HTMLInputElement;
        const key = input.dataset.set as 'shapeRadius' | 'tiltDeg';
        input.value = String(loadSettings()[key]);
        m.querySelector(`[data-val="${key}"]`)!.textContent = `${input.value}${input.dataset.unit}`;
      });
    };
    m.querySelectorAll('input[data-set]').forEach((el) => {
      const input = el as HTMLInputElement;
      input.addEventListener('input', () => {
        const cur = loadSettings();
        const key = input.dataset.set as 'shapeRadius' | 'tiltDeg';
        cur[key] = Number(input.value);
        saveSettings(cur);
        m.querySelector(`[data-val="${key}"]`)!.textContent = `${input.value}${input.dataset.unit}`;
      });
    });
    m.querySelector('[data-act="reset"]')!.addEventListener('click', () => {
      saveSettings({ ...DEFAULT_SETTINGS });
      sync();
    });
    m.querySelector('[data-act="close"]')!.addEventListener('click', () => m.remove());
    this.root.appendChild(m);
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
