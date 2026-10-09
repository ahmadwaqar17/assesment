// localStorage persistence. Storage can be missing, full or blocked, so every access is guarded.
import { seedState, type AppState } from './reducer';

export const STORAGE_KEY = 'toll-recovery:v1';

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): KeyValueStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function loadState(storage: KeyValueStorage | undefined = defaultStorage()): AppState {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    if (parsed.version !== 1 || !Array.isArray(parsed.rows) || !Array.isArray(parsed.trips)) return seedState();
    return { ...seedState(), ...parsed } as AppState;
  } catch {
    return seedState();
  }
}

export function saveState(state: AppState, storage: KeyValueStorage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked: the app keeps working, it just won't survive a reload.
  }
}
