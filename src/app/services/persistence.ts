import { Injectable } from '@angular/core';

export interface SaveData {
  stars: Record<number, number>;
  unlocked: number;
}

const KEY = 'panewrangler';

@Injectable({ providedIn: 'root' })
export class Persistence {
  load(): SaveData {
    try {
      const sv = JSON.parse(localStorage.getItem(KEY) || '{}');
      return { stars: sv.stars || {}, unlocked: sv.unlocked || 1 };
    } catch {
      return { stars: {}, unlocked: 1 };
    }
  }

  save(stars: Record<number, number>, unlocked: number): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ stars, unlocked }));
    } catch {
      // storage unavailable — progress just won't persist
    }
  }
}
