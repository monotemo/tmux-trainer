import { computed, inject, Injectable, signal } from '@angular/core';
import { buildLevel, LEVELS } from '../engine/levels';
import { applyKey, dispName, leavesOf, rectsOf, ses, sig, win } from '../engine/tmux-engine';
import { BuiltLevel, Rect, TmuxState } from '../engine/tmux-types';
import { Persistence } from './persistence';
import { Sound } from './sound';

export interface GhostItem {
  label: string;
  rects: Rect[];
  transform: string;
  opacity: number;
}

interface PileEntry {
  label: string;
  rects: Rect[];
}

export type Overlay = 'intro' | 'win' | 'done' | 'help' | null;

@Injectable({ providedIn: 'root' })
export class GameStore {
  private readonly sound = inject(Sound);
  private readonly persistence = inject(Persistence);

  readonly lvlIdx = signal(0);
  readonly level = signal<BuiltLevel>(buildLevel(0));
  readonly state = signal<TmuxState>(this.level().start);
  readonly moves = signal(0);
  readonly armed = signal(false);
  readonly flying = signal(false);
  readonly confirming = signal<{ cmd: string; label: string } | null>(null);
  readonly renaming = signal<{ buf: string } | null>(null);
  readonly choosing = signal<{ idx: number } | null>(null);
  readonly starsByLevel = signal<Record<number, number>>({});
  readonly unlocked = signal(1);
  readonly pile = signal<PileEntry[]>([]);
  readonly overlay = signal<Overlay>('intro');
  readonly msg = signal<{ text: string; err: boolean } | null>(null);
  readonly lastWin = signal<{ stars: number; moves: number; par: number } | null>(null);

  private msgTimer: ReturnType<typeof setTimeout> | null = null;

  readonly curSession = computed(() => ses(this.state()));
  readonly curWindow = computed(() => win(this.state()));

  readonly totalStars = computed(() =>
    Object.values(this.starsByLevel()).reduce((a, b) => a + b, 0),
  );

  readonly statusText = computed<{ text: string; err: boolean } | null>(() => {
    const c = this.confirming();
    if (c) return { text: c.label, err: false };
    const r = this.renaming();
    if (r) return { text: '(rename-window) ' + r.buf + '▍', err: false };
    return this.msg();
  });

  readonly learnedKeys = computed(() => {
    const set: Record<string, boolean> = {};
    for (let i = 0; i <= this.lvlIdx() && i < LEVELS.length; i++) {
      LEVELS[i].teach.forEach((t) => (set[t[0]] = true));
    }
    return set;
  });

  readonly levelDots = computed(() =>
    LEVELS.map((_, i) => ({
      i,
      label: i + 1,
      cur: i === this.lvlIdx(),
      done: i !== this.lvlIdx() && !!this.starsByLevel()[i],
      locked: i !== this.lvlIdx() && !this.starsByLevel()[i] && i >= this.unlocked(),
    })),
  );

  readonly ghostItems = computed<GhostItem[]>(() => {
    const s = this.state();
    const items: { label: string; rects: Rect[]; live: boolean }[] = [];
    const S = ses(s);
    S.windows.forEach((w, i) => {
      if (!s.detached && i === S.activeWin) return;
      items.push({ label: i + ':' + dispName(w), rects: rectsOf(w), live: true });
    });
    this.pile()
      .slice(-4)
      .forEach((g) => items.push({ ...g, live: false }));
    return items.slice(0, 7).map((g, i) => {
      const depth = i + 1;
      return {
        label: g.label,
        rects: g.rects,
        transform: `translate3d(${depth * 30}px,${-depth * 22}px,${-depth * 85}px)`,
        opacity: Math.max(0.15, (g.live ? 0.85 : 0.5) - depth * 0.1),
      };
    });
  });

  constructor() {
    const sv = this.persistence.load();
    this.starsByLevel.set(sv.stars);
    this.unlocked.set(sv.unlocked);
    this.loadLevel(Math.min(sv.unlocked - 1, LEVELS.length - 1));
  }

  loadLevel(i: number): void {
    this.lvlIdx.set(i);
    const level = buildLevel(i);
    this.level.set(level);
    this.state.set(structuredClone(level.start));
    this.moves.set(0);
    this.armed.set(false);
    this.confirming.set(null);
    this.renaming.set(null);
    this.choosing.set(null);
    this.flying.set(false);
    this.setMsg(null);
    if (this.overlay() === 'win') this.overlay.set(null);
  }

  restart(): void {
    this.state.set(structuredClone(this.level().start));
    this.moves.set(0);
    this.armed.set(false);
    this.confirming.set(null);
    this.renaming.set(null);
    this.choosing.set(null);
    this.setMsg('level restarted');
  }

  setMsg(m: string | null, err = false, sticky = false): void {
    if (this.msgTimer) clearTimeout(this.msgTimer);
    this.msg.set(m ? { text: m, err } : null);
    if (m && !sticky) {
      this.msgTimer = setTimeout(() => this.msg.set(null), 2200);
    }
  }

  execKey(key: string, goodBeep?: number): void {
    const next = structuredClone(this.state());
    const r = applyKey(next, key);
    // Set unconditionally: failed ops can still mutate (nav clears zoom).
    this.state.set(next);
    if (r.ok) {
      this.moves.update((m) => m + 1);
      this.sound.beep(goodBeep || 660, 0.05);
    } else {
      this.sound.beep(150, 0.12);
    }
    if (r.msg) this.setMsg(r.msg, !r.ok);
    if (r.ok) this.checkWin();
  }

  private checkWin(): void {
    if (sig(this.state()) !== sig(this.level().target)) return;
    this.flying.set(true);
    this.sound.winChime();
    const level = this.level();
    const moves = this.moves();
    const stars = moves <= level.par ? 3 : moves <= level.par + 2 ? 2 : 1;
    this.starsByLevel.update((sb) => ({
      ...sb,
      [this.lvlIdx()]: Math.max(sb[this.lvlIdx()] || 0, stars),
    }));
    this.unlocked.update((u) => Math.max(u, Math.min(this.lvlIdx() + 2, LEVELS.length)));
    this.persistence.save(this.starsByLevel(), this.unlocked());
    this.lastWin.set({ stars, moves, par: level.par });
    setTimeout(() => {
      this.flying.set(false);
      const tS = level.target.sessions[level.target.activeSes];
      this.pile.update((p) => [
        ...p,
        { label: level.def.name, rects: rectsOf(tS.windows[tS.activeWin]) },
      ]);
      this.overlay.set(this.lvlIdx() + 1 >= LEVELS.length ? 'done' : 'win');
    }, 550);
  }

  private openChooser(): void {
    const s = this.state();
    if (s.sessions.length < 2) {
      this.setMsg('no other sessions', true);
      this.sound.beep(150, 0.12);
      return;
    }
    this.choosing.set({ idx: (s.activeSes + 1) % s.sessions.length });
  }

  private runCommand(key: string): void {
    if (key === 'x') {
      if (leavesOf(win(this.state()).root).length <= 1) {
        this.setMsg("can't kill the last pane", true);
        this.sound.beep(150, 0.12);
        return;
      }
      this.confirming.set({ cmd: 'x', label: 'kill-pane? (y/n)' });
      return;
    }
    if (key === '&') {
      if (ses(this.state()).windows.length <= 1) {
        this.setMsg("can't kill the last window", true);
        this.sound.beep(150, 0.12);
        return;
      }
      this.confirming.set({
        cmd: '&',
        label: 'kill-window ' + dispName(win(this.state())) + '? (y/n)',
      });
      return;
    }
    if (key === ',') {
      this.renaming.set({ buf: dispName(win(this.state())) });
      return;
    }
    if (key === 's') {
      this.openChooser();
      return;
    }
    this.execKey(key);
  }

  hint(): void {
    this.setMsg(
      'try: ' +
        this.level()
          .def.solution.map((k) => {
            if (k === ' ') return 'space';
            if (k.charAt(0) === ',') return ', then type ' + k.slice(1);
            if (k.slice(0, 2) === 's:') return 's then pick ' + k.slice(2);
            return k.replace('Arrow', '').toLowerCase();
          })
          .join(' → '),
    );
  }

  playAgain(): void {
    this.pile.set([]);
    this.overlay.set(null);
    this.loadLevel(0);
  }

  // Mirrors the original single keydown handler, including its ordering and
  // the confirm-prompt fall-through (a cancelling key still performs its
  // normal unprefixed/prefix role in the same keystroke).
  handleKey(e: KeyboardEvent): void {
    const overlay = this.overlay();
    if (overlay === 'intro') {
      if (e.key === 'Enter') this.overlay.set(null);
      return;
    }
    if (overlay === 'help') {
      if (e.key === 'Enter' || e.key === 'Escape' || e.key === '?') this.overlay.set(null);
      return;
    }
    if (overlay === 'win') {
      if (e.key === 'Enter') this.loadLevel(this.lvlIdx() + 1);
      return;
    }
    if (overlay === 'done') {
      if (e.key === 'Enter') this.playAgain();
      return;
    }
    if (this.flying()) return;

    const renaming = this.renaming();
    if (renaming) {
      e.preventDefault();
      if (e.key === 'Enter') {
        const name = renaming.buf.trim();
        this.renaming.set(null);
        if (name) {
          this.execKey(',' + name, 520);
        } else {
          this.setMsg('rename cancelled');
        }
      } else if (e.key === 'Escape') {
        this.renaming.set(null);
        this.setMsg('rename cancelled');
      } else if (e.key === 'Backspace') {
        this.renaming.set({ buf: renaming.buf.slice(0, -1) });
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        if (renaming.buf.length < 16) this.renaming.set({ buf: renaming.buf + e.key });
      }
      return;
    }

    const choosing = this.choosing();
    if (choosing) {
      e.preventDefault();
      const n = this.state().sessions.length;
      if (e.key === 'ArrowDown') {
        this.choosing.set({ idx: (choosing.idx + 1) % n });
      } else if (e.key === 'ArrowUp') {
        this.choosing.set({ idx: (choosing.idx - 1 + n) % n });
      } else if (e.key === 'Enter') {
        const name = this.state().sessions[choosing.idx].name;
        this.choosing.set(null);
        this.execKey('s:' + name, 520);
      } else if (e.key === 'Escape' || e.key === 'q') {
        this.choosing.set(null);
        this.setMsg('cancelled');
      }
      return;
    }

    const confirming = this.confirming();
    if (confirming) {
      if (e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta') return;
      if (e.key === 'y' || e.key === 'Y') {
        this.confirming.set(null);
        this.execKey(confirming.cmd, 440);
        e.preventDefault();
        return;
      }
      // like tmux confirm-before: any other key cancels the prompt
      this.confirming.set(null);
      this.setMsg('kill cancelled');
      if (e.key === 'n' || e.key === 'N' || e.key === 'Escape') {
        e.preventDefault();
        return;
      }
      // fall through so the key still does its normal job (r restarts, ctrl+b arms, etc.)
    }

    if (this.state().detached) {
      if (e.key === 'Enter') {
        this.execKey('ATTACH');
        this.moves.update((m) => m - 1); // re-attaching is free
        e.preventDefault();
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        this.restart();
        return;
      }
      if (e.key === '?') {
        this.overlay.set('help');
        return;
      }
      return;
    }

    if (e.ctrlKey && (e.key === 'b' || e.key === 'B')) {
      this.armed.set(true);
      this.sound.beep(880, 0.04, 'sine', 0.02);
      e.preventDefault();
      return;
    }

    if (this.armed()) {
      if (e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta') return;
      this.armed.set(false);
      if (e.key === 'Escape') {
        this.setMsg('prefix cancelled');
        e.preventDefault();
        return;
      }
      e.preventDefault();
      this.runCommand(e.key);
      return;
    }

    // unprefixed keys
    if (e.key === 'r' || e.key === 'R') {
      this.restart();
    } else if (e.key === '?') {
      this.overlay.set('help');
    } else if (
      '%"oxz{}cnpds&,'.indexOf(e.key) >= 0 ||
      e.key === ' ' ||
      e.key.slice(0, 5) === 'Arrow'
    ) {
      this.setMsg('prefix first: ctrl+b, then ' + (e.key === ' ' ? 'space' : e.key), true);
      this.sound.beep(150, 0.1);
      e.preventDefault();
    }
  }
}
