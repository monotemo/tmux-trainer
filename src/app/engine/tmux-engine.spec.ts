import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyKey,
  cloneState,
  doKill,
  doKillWin,
  doLayout,
  doNav,
  doNewWin,
  doNext,
  doRename,
  doSesSel,
  doSplit,
  doSwap,
  doWinNav,
  doWinSel,
  doZoom,
  dispName,
  LAYOUTS,
  leavesOf,
  newState,
  rectsOf,
  resetIds,
  ses,
  sig,
  win,
  winSig,
} from './tmux-engine';
import { TmuxState } from './tmux-types';

function fresh(spawn: string[] = []): TmuxState {
  resetIds();
  return newState('work', 'vim', spawn);
}

function apps(s: TmuxState): string[] {
  return leavesOf(win(s).root).map((l) => l.app);
}

beforeEach(() => resetIds());

describe('doSplit', () => {
  it('splits horizontally into two 50% panes and activates the new pane', () => {
    const s = fresh(['node']);
    const r = doSplit(s, 'h');
    expect(r.ok).toBe(true);
    const rects = rectsOf(win(s));
    expect(rects).toHaveLength(2);
    expect(rects.map((p) => [p.x, p.w])).toEqual([
      [0, 50],
      [50, 50],
    ]);
    const active = leavesOf(win(s).root).find((l) => l.id === win(s).activeId)!;
    expect(active.app).toBe('node');
  });

  it('consumes the spawn queue and falls back to bash when empty', () => {
    const s = fresh(['node']);
    doSplit(s, 'h');
    expect(s.spawn).toEqual([]);
    doSplit(s, 'v');
    expect(apps(s)).toContain('bash');
  });

  it('resets zoom and layoutIdx', () => {
    const s = fresh(['node', 'htop']);
    doSplit(s, 'h');
    doZoom(s);
    doLayout(s);
    doSplit(s, 'v');
    expect(win(s).zoomed).toBeNull();
    expect(win(s).layoutIdx).toBe(-1);
  });

  it('nested % then " matches level-3 geometry (50 / 25+25)', () => {
    const s = fresh(['node', 'htop']);
    doSplit(s, 'h');
    doSplit(s, 'v');
    const rects = rectsOf(win(s)).sort((a, b) => a.x - b.x || a.y - b.y);
    expect(rects.map((p) => [p.app, p.x, p.y, p.w, p.h])).toEqual([
      ['vim', 0, 0, 50, 100],
      ['node', 50, 0, 50, 50],
      ['htop', 50, 50, 50, 50],
    ]);
  });
});

describe('doKill', () => {
  it('refuses to kill the last pane', () => {
    const s = fresh();
    const r = doKill(s);
    expect(r).toEqual({ ok: false, msg: "can't kill the last pane" });
  });

  it('collapses a single-child split back into a leaf', () => {
    const s = fresh(['node']);
    doSplit(s, 'h');
    doKill(s);
    expect(win(s).root.type).toBe('leaf');
    expect(apps(s)).toEqual(['vim']);
  });

  it('moves the active pane to the previous leaf', () => {
    const s = fresh(['node', 'htop']);
    doSplit(s, 'h');
    doSplit(s, 'h');
    // leaves: vim, node, htop — active is htop (index 2)
    doKill(s);
    const active = leavesOf(win(s).root).find((l) => l.id === win(s).activeId)!;
    expect(active.app).toBe('node');
  });
});

describe('doSwap', () => {
  it('refuses with a single pane', () => {
    const s = fresh();
    expect(doSwap(s, -1).ok).toBe(false);
  });

  it('swaps id and app with the neighbor, wrapping around', () => {
    const s = fresh(['node']);
    doSplit(s, 'h'); // [vim, node], active node
    doSwap(s, 1); // forward from last wraps to first
    expect(apps(s)).toEqual(['node', 'vim']);
    const active = leavesOf(win(s).root).find((l) => l.id === win(s).activeId)!;
    expect(active.app).toBe('node');
  });

  it('clears zoom', () => {
    const s = fresh(['node']);
    doSplit(s, 'h');
    doZoom(s);
    doSwap(s, -1);
    expect(win(s).zoomed).toBeNull();
  });
});

describe('doNav', () => {
  function grid(): TmuxState {
    // 2x2: vim | node on top of logs | htop, active ends bottom-left (logs)
    const s = fresh(['node', 'htop', 'logs']);
    doSplit(s, 'h'); // vim | node*
    doSplit(s, 'v'); // node / htop*
    doNav(s, -1, 0); // left to vim... vim spans full height, nearest
    doSplit(s, 'v'); // vim / logs*
    return s;
  }

  it('moves in all four directions across a 2x2 grid', () => {
    const s = grid();
    const at = () => leavesOf(win(s).root).find((l) => l.id === win(s).activeId)!.app;
    expect(at()).toBe('logs');
    doNav(s, 1, 0);
    expect(at()).toBe('htop');
    doNav(s, 0, -1);
    expect(at()).toBe('node');
    doNav(s, -1, 0);
    expect(at()).toBe('vim');
    doNav(s, 0, 1);
    expect(at()).toBe('logs');
  });

  it('fails when no pane lies in that direction', () => {
    const s = fresh(['node']);
    doSplit(s, 'h');
    const r = doNav(s, 1, 0); // active is rightmost
    expect(r).toEqual({ ok: false, msg: 'no pane in that direction' });
  });

  it('clears zoom even when the move fails (original quirk)', () => {
    const s = fresh(['node']);
    doSplit(s, 'h');
    doZoom(s);
    expect(win(s).zoomed).not.toBeNull();
    doNav(s, 1, 0); // fails
    expect(win(s).zoomed).toBeNull();
  });

  it('picks the nearest overlapping pane', () => {
    // left tall pane next to two stacked right panes; from top-right going left
    const s = fresh(['node', 'htop']);
    doSplit(s, 'h');
    doSplit(s, 'v'); // right side: node / htop*, left: vim full height
    doNav(s, 0, -1); // up to node
    doNav(s, -1, 0); // left lands on vim
    const active = leavesOf(win(s).root).find((l) => l.id === win(s).activeId)!;
    expect(active.app).toBe('vim');
  });
});

describe('doNext / doZoom', () => {
  it('o cycles leaf order and clears zoom', () => {
    const s = fresh(['node']);
    doSplit(s, 'h');
    doZoom(s);
    doNext(s);
    expect(win(s).zoomed).toBeNull();
    const active = leavesOf(win(s).root).find((l) => l.id === win(s).activeId)!;
    expect(active.app).toBe('vim');
  });

  it('o fails with one pane', () => {
    const s = fresh();
    expect(doNext(s).ok).toBe(false);
  });

  it('z toggles zoom and winSig gains a Z: prefix', () => {
    const s = fresh(['node']);
    doSplit(s, 'h');
    doZoom(s);
    expect(win(s).zoomed).toBe(win(s).activeId);
    expect(winSig(win(s))).toMatch(/^Z:node\|/);
    doZoom(s);
    expect(win(s).zoomed).toBeNull();
  });
});

describe('doLayout', () => {
  it('cycles through all five layouts and wraps', () => {
    const s = fresh(['node']);
    doSplit(s, 'h');
    const names = LAYOUTS.map(() => doLayout(s).msg);
    expect(names).toEqual(LAYOUTS);
    expect(doLayout(s).msg).toBe(LAYOUTS[0]);
  });

  it('tiled with five panes makes a 3+2 grid', () => {
    const s = fresh(['node', 'htop', 'logs', 'bash']);
    for (let i = 0; i < 4; i++) doSplit(s, 'h');
    win(s).layoutIdx = LAYOUTS.indexOf('tiled') - 1;
    doLayout(s);
    const rects = rectsOf(win(s));
    const topRow = rects.filter((r) => r.y === 0);
    const bottomRow = rects.filter((r) => r.y === 50);
    expect(topRow).toHaveLength(3);
    expect(bottomRow).toHaveLength(2);
  });

  it('main-vertical puts the first pane on the left at half width', () => {
    const s = fresh(['node', 'htop']);
    doSplit(s, 'h');
    doSplit(s, 'h');
    win(s).layoutIdx = LAYOUTS.indexOf('main-vertical') - 1;
    doLayout(s);
    const rects = rectsOf(win(s));
    expect(rects[0]).toMatchObject({ app: 'vim', x: 0, y: 0, w: 50, h: 100 });
    expect(rects.filter((r) => r.x === 50)).toHaveLength(2);
  });
});

describe('window ops', () => {
  it('doNewWin consumes the spawn queue and activates the new window', () => {
    const s = fresh(['node']);
    doNewWin(s);
    expect(ses(s).windows).toHaveLength(2);
    expect(ses(s).activeWin).toBe(1);
    expect(dispName(win(s))).toBe('node');
    doNewWin(s);
    expect(dispName(win(s))).toBe('bash');
  });

  it('doWinNav wraps both directions and fails with one window', () => {
    const s = fresh(['node', 'htop']);
    expect(doWinNav(s, 1).ok).toBe(false);
    doNewWin(s);
    doNewWin(s); // active = 2
    doWinNav(s, 1);
    expect(ses(s).activeWin).toBe(0);
    doWinNav(s, -1);
    expect(ses(s).activeWin).toBe(2);
  });

  it('doWinSel rejects out-of-range indices', () => {
    const s = fresh();
    expect(doWinSel(s, 1)).toEqual({ ok: false, msg: 'no window 1' });
    expect(doWinSel(s, 0).ok).toBe(true);
  });

  it('doRename rejects empty names and sets named', () => {
    const s = fresh();
    expect(doRename(s, '')).toEqual({ ok: false, msg: 'empty name' });
    doRename(s, 'build');
    expect(win(s).named).toBe(true);
    expect(dispName(win(s))).toBe('build');
  });

  it('dispName falls back to the active leaf app when unnamed', () => {
    const s = fresh(['node']);
    expect(dispName(win(s))).toBe('vim');
    doSplit(s, 'h');
    expect(dispName(win(s))).toBe('node');
  });

  it('doKillWin guards the last window and steps the index back', () => {
    const s = fresh(['node', 'htop']);
    expect(doKillWin(s)).toEqual({ ok: false, msg: "can't kill the last window" });
    doNewWin(s);
    doNewWin(s);
    doWinSel(s, 1);
    doKillWin(s);
    expect(ses(s).windows).toHaveLength(2);
    expect(ses(s).activeWin).toBe(0);
  });
});

describe('sessions and applyKey', () => {
  it('detach sets the flag with the tmux message', () => {
    const s = fresh();
    expect(applyKey(s, 'd')).toEqual({ ok: true, msg: '[detached (from session work)]' });
    expect(s.detached).toBe(true);
  });

  it('detached state rejects everything except ATTACH', () => {
    const s = fresh();
    applyKey(s, 'd');
    expect(applyKey(s, '%')).toEqual({ ok: false, msg: 'detached — press enter to attach' });
    expect(applyKey(s, 'ATTACH')).toEqual({ ok: true, msg: 'attached' });
    expect(s.detached).toBe(false);
  });

  it('doSesSel switches sessions and fails on unknown names', () => {
    const s = fresh();
    s.sessions.push({ name: 'scratch', windows: ses(s).windows, activeWin: 0 });
    expect(doSesSel(s, 'nope')).toEqual({ ok: false, msg: 'no session nope' });
    expect(applyKey(s, 's:scratch')).toEqual({ ok: true, msg: 'attached to scratch' });
    expect(s.activeSes).toBe(1);
  });

  it('routes ,name and digits and reports unbound keys', () => {
    const s = fresh();
    expect(applyKey(s, ',build').ok).toBe(true);
    expect(dispName(win(s))).toBe('build');
    expect(applyKey(s, '0').ok).toBe(true);
    expect(applyKey(s, 'q')).toEqual({ ok: false, msg: 'q is not bound (yet)' });
  });
});

describe('sig', () => {
  it('is identical for identical states', () => {
    const s = fresh(['node']);
    doSplit(s, 'h');
    expect(sig(cloneState(s))).toBe(sig(s));
  });

  it('changes on activeWin, rename, zoom, and detach', () => {
    const s = fresh(['node', 'htop']);
    const base = sig(s);
    const s2 = cloneState(s);
    doNewWin(s2);
    expect(sig(s2)).not.toBe(base);
    const s3 = cloneState(s);
    doRename(s3, 'x');
    expect(sig(s3)).not.toBe(base);
    const s4 = cloneState(s);
    doSplit(s4, 'h');
    const zoomedSig = sig(s4);
    doZoom(s4);
    expect(sig(s4)).not.toBe(zoomedSig);
    const s5 = cloneState(s);
    s5.detached = true;
    expect(sig(s5)).toMatch(/^D\|/);
    expect(sig(s5)).not.toBe(base);
  });

  it('is independent of tree shape when geometry matches', () => {
    // a single % split equals even-horizontal of the same two panes
    const a = fresh(['node']);
    doSplit(a, 'h');
    const b = cloneState(a);
    win(b).layoutIdx = LAYOUTS.indexOf('even-horizontal') - 1;
    doLayout(b);
    expect(winSig(win(b))).toBe(winSig(win(a)));
  });
});
