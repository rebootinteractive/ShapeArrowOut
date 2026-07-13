/** Global feel settings, tweakable from the main menu, persisted per browser. */
export interface Settings {
  shapeRadius: number; // outer radius of the shape stack (world units)
  tiltDeg: number; // pie lean-back angle in degrees
}

export const DEFAULT_SETTINGS: Settings = {
  shapeRadius: 2.2,
  tiltDeg: 50,
};

const KEY = 'sao:settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}
