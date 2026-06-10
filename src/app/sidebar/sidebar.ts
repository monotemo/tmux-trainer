import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ALLKEYS } from '../engine/levels';
import { GameStore } from '../services/game-store';
import { TmuxWindow } from '../tmux-window/tmux-window';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TmuxWindow],
})
export class Sidebar {
  readonly store = inject(GameStore);
  readonly allKeys = ALLKEYS;

  readonly targetSession = computed(() => {
    const t = this.store.level().target;
    return t.sessions[t.activeSes];
  });

  readonly targetWin = computed(() => {
    const S = this.targetSession();
    return S.windows[S.activeWin];
  });

  clickDot(i: number): void {
    if (i < this.store.unlocked()) this.store.loadLevel(i);
  }
}
