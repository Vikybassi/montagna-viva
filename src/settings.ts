import type { Choice } from "./quality";

/** Impostazioni del giocatore, ricordate nel browser. */
export type Settings = { quality: Choice; volume: number; sens: number; invertY: boolean };
const KEY = "montagna-viva:settings";
const DEF: Settings = { quality: "auto", volume: 0.9, sens: 1, invertY: false };
export function loadSettings(): Settings {
  try {
    return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEF };
  }
}
export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* niente */
  }
}
