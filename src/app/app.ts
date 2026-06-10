import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LEVELS } from './engine/levels';
import { Scene } from './scene/scene';
import { GameStore } from './services/game-store';
import { Sidebar } from './sidebar/sidebar';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Scene, Sidebar],
  host: { '(document:keydown)': 'store.handleKey($event)' },
})
export class App {
  readonly store = inject(GameStore);
  readonly maxStars = LEVELS.length * 3;

  readonly winStars = computed(() => {
    const w = this.store.lastWin();
    if (!w) return '';
    return '★'.repeat(w.stars) + '☆'.repeat(3 - w.stars);
  });

  readonly winSub = computed(() => {
    const w = this.store.lastWin();
    if (!w) return '';
    return w.moves + ' moves, par ' + w.par + (w.stars === 3 ? ' — clean.' : '');
  });
}
