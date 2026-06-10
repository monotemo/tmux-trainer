import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { APPCOLOR } from '../engine/levels';
import { GameStore } from '../services/game-store';
import { TmuxWindow } from '../tmux-window/tmux-window';

@Component({
  selector: 'app-scene',
  templateUrl: './scene.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TmuxWindow],
})
export class Scene {
  readonly store = inject(GameStore);

  ghostBg(app: string): string {
    return (APPCOLOR[app] || '#333') + '22';
  }
}
