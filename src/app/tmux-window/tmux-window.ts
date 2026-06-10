import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { APPCOLOR, HTOP_BARS, PBODY } from '../engine/levels';
import { dispName, findLeaf, rectsOf } from '../engine/tmux-engine';
import { Rect, TmuxSession, TmuxWindow as TmuxWindowModel } from '../engine/tmux-types';

// Shared window renderer: the live game window (winbar, interactive panes,
// status message, detached shell screen) and the sidebar target preview.
@Component({
  selector: 'app-tmux-window',
  templateUrl: './tmux-window.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'win' },
})
export class TmuxWindow {
  readonly win = input.required<TmuxWindowModel>();
  readonly session = input.required<TmuxSession>();
  readonly live = input(false);
  readonly detached = input(false);
  readonly levelName = input('');
  readonly armed = input(false);
  readonly status = input<{ text: string; err: boolean } | null>(null);

  readonly htopBars = HTOP_BARS;
  readonly shellPost = '▍\n\npress enter to run it';

  readonly rects = computed<Rect[]>(() => {
    const w = this.win();
    if (w.zoomed) {
      const lf = findLeaf(w, w.zoomed);
      if (lf) return [{ id: lf.id, app: lf.app, x: 0, y: 0, w: 100, h: 100 }];
    }
    return rectsOf(w);
  });

  readonly statusLeft = computed(() => {
    const S = this.session();
    const tabs = S.windows
      .map((w, i) => i + ':' + dispName(w) + (i === S.activeWin ? '*' : ''))
      .join('  ');
    return '[' + S.name + '] ' + tabs + (this.win().zoomed ? 'Z' : '');
  });

  readonly shellPre = computed(
    () => '$ tmux detach-client\n[detached (from session ' + this.session().name + ')]\n$ ',
  );
  readonly shellBold = computed(() => 'tmux attach -t ' + this.session().name);
  readonly targetShell = computed(
    () => '[detached]\nsession "' + this.session().name + '" keeps running:\n',
  );

  appColor(app: string): string {
    return APPCOLOR[app] || '#5b6377';
  }

  paneBody(app: string): string {
    return PBODY[app] || '$ _';
  }
}
