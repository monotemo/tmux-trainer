// Pure tmux simulation engine — a 1:1 port of the original game's model.
// Ops mutate the passed state in place (callers clone first if they need
// immutability) and report success via OpResult, exactly like the original.
import {
  OpResult,
  PaneLeaf,
  PaneNode,
  Rect,
  TmuxSession,
  TmuxState,
  TmuxWindow,
} from './tmux-types';

let _id = 1;

export function resetIds(): void {
  _id = 1;
}

function L(app: string): PaneLeaf {
  return { type: 'leaf', id: _id++, app };
}

export function newWin(app: string): TmuxWindow {
  const lf = L(app);
  return { named: false, name: '', root: lf, activeId: lf.id, zoomed: null, layoutIdx: -1 };
}

export function newState(sesName: string, app: string, spawn: string[]): TmuxState {
  return {
    sessions: [{ name: sesName, windows: [newWin(app)], activeWin: 0 }],
    activeSes: 0,
    detached: false,
    spawn: spawn.slice(),
  };
}

export function ses(s: TmuxState): TmuxSession {
  return s.sessions[s.activeSes];
}

export function win(s: TmuxState): TmuxWindow {
  const S = ses(s);
  return S.windows[S.activeWin];
}

export function cloneState(s: TmuxState): TmuxState {
  return JSON.parse(JSON.stringify(s)) as TmuxState;
}

export function leavesOf(n: PaneNode | null, out?: PaneLeaf[]): PaneLeaf[] {
  out = out || [];
  if (!n) return out;
  if (n.type === 'leaf') out.push(n);
  else n.children.forEach((c) => leavesOf(c, out));
  return out;
}

export function findLeaf(w: TmuxWindow, id: number): PaneLeaf | undefined {
  return leavesOf(w.root).find((l) => l.id === id);
}

export function dispName(w: TmuxWindow): string {
  if (w.named) return w.name;
  const lf = findLeaf(w, w.activeId);
  return lf ? lf.app : '?';
}

export function rectsOf(w: TmuxWindow): Rect[] {
  const out: Rect[] = [];
  (function go(n: PaneNode, x: number, y: number, wd: number, h: number) {
    if (n.type === 'leaf') {
      out.push({ id: n.id, app: n.app, x, y, w: wd, h });
      return;
    }
    const k = n.children.length;
    if (n.dir === 'h') {
      const cw = wd / k;
      n.children.forEach((c, i) => go(c, x + i * cw, y, cw, h));
    } else {
      const ch = h / k;
      n.children.forEach((c, i) => go(c, x, y + i * ch, wd, ch));
    }
  })(w.root, 0, 0, 100, 100);
  return out;
}

export function winSig(w: TmuxWindow): string {
  const r = rectsOf(w)
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map(
      (p) =>
        p.app +
        '@' +
        p.x.toFixed(1) +
        ',' +
        p.y.toFixed(1) +
        ',' +
        p.w.toFixed(1) +
        ',' +
        p.h.toFixed(1),
    )
    .join(';');
  let z = '';
  if (w.zoomed) {
    const lf = findLeaf(w, w.zoomed);
    if (lf) z = 'Z:' + lf.app + '|';
  }
  return z + r;
}

export function sig(s: TmuxState): string {
  const S = ses(s);
  const parts = S.windows.map((w) => (w.named ? w.name : '~') + '{' + winSig(w) + '}');
  return (s.detached ? 'D|' : 'A|') + S.name + '#' + S.activeWin + '|' + parts.join('||');
}

// --- pane ops ---
export function doSplit(s: TmuxState, dir: 'h' | 'v'): OpResult {
  const w = win(s);
  const lf = findLeaf(w, w.activeId);
  if (!lf) return { ok: false, msg: 'no active pane' };
  const app = s.spawn.length ? s.spawn.shift()! : 'bash';
  const a: PaneLeaf = { type: 'leaf', id: lf.id, app: lf.app };
  const b = L(app);
  // The original mutates the leaf into a split node in place.
  const node = lf as unknown as Record<string, unknown>;
  node['type'] = 'split';
  node['dir'] = dir;
  node['children'] = [a, b];
  delete node['id'];
  delete node['app'];
  w.activeId = b.id;
  w.zoomed = null;
  w.layoutIdx = -1;
  return { ok: true };
}

function removeLeaf(n: PaneNode, id: number): PaneNode | null {
  if (n.type === 'leaf') return n.id === id ? null : n;
  const ch = n.children.map((c) => removeLeaf(c, id)).filter((c): c is PaneNode => !!c);
  if (!ch.length) return null;
  if (ch.length === 1) return ch[0];
  return { type: 'split', dir: n.dir, children: ch };
}

export function doKill(s: TmuxState): OpResult {
  const w = win(s);
  const ls = leavesOf(w.root);
  if (ls.length <= 1) return { ok: false, msg: "can't kill the last pane" };
  const i = ls.findIndex((l) => l.id === w.activeId);
  w.root = removeLeaf(w.root, w.activeId)!;
  const ls2 = leavesOf(w.root);
  w.activeId = ls2[Math.min(Math.max(0, i - 1), ls2.length - 1)].id;
  w.zoomed = null;
  w.layoutIdx = -1;
  return { ok: true };
}

export function doSwap(s: TmuxState, d: number): OpResult {
  const w = win(s);
  const ls = leavesOf(w.root);
  if (ls.length < 2) return { ok: false, msg: 'nothing to swap with' };
  const i = ls.findIndex((l) => l.id === w.activeId);
  const j = (i + d + ls.length) % ls.length;
  const a = ls[i],
    b = ls[j];
  const t = { id: a.id, app: a.app };
  a.id = b.id;
  a.app = b.app;
  b.id = t.id;
  b.app = t.app;
  w.zoomed = null;
  return { ok: true };
}

function overlapV(r: Rect, a: Rect): boolean {
  return r.y < a.y + a.h - 0.01 && r.y + r.h > a.y + 0.01;
}

function overlapH(r: Rect, a: Rect): boolean {
  return r.x < a.x + a.w - 0.01 && r.x + r.w > a.x + 0.01;
}

export function doNav(s: TmuxState, dx: number, dy: number): OpResult {
  const w = win(s);
  w.zoomed = null;
  const rs = rectsOf(w);
  const a = rs.find((r) => r.id === w.activeId)!;
  const cand = rs.filter((r) => {
    if (r.id === a.id) return false;
    if (dx < 0) return r.x + r.w <= a.x + 0.01 && overlapV(r, a);
    if (dx > 0) return r.x >= a.x + a.w - 0.01 && overlapV(r, a);
    if (dy < 0) return r.y + r.h <= a.y + 0.01 && overlapH(r, a);
    return r.y >= a.y + a.h - 0.01 && overlapH(r, a);
  });
  if (!cand.length) return { ok: false, msg: 'no pane in that direction' };
  function dist(r: Rect): number {
    if (dx < 0) return a.x - (r.x + r.w);
    if (dx > 0) return r.x - (a.x + a.w);
    if (dy < 0) return a.y - (r.y + r.h);
    return r.y - (a.y + a.h);
  }
  cand.sort((p, q) => dist(p) - dist(q));
  w.activeId = cand[0].id;
  return { ok: true };
}

export function doNext(s: TmuxState): OpResult {
  const w = win(s);
  w.zoomed = null;
  const ls = leavesOf(w.root);
  if (ls.length < 2) return { ok: false, msg: 'only one pane' };
  const i = ls.findIndex((l) => l.id === w.activeId);
  w.activeId = ls[(i + 1) % ls.length].id;
  return { ok: true };
}

export function doZoom(s: TmuxState): OpResult {
  const w = win(s);
  w.zoomed = w.zoomed === w.activeId ? null : w.activeId;
  return { ok: true };
}

export const LAYOUTS = [
  'even-horizontal',
  'even-vertical',
  'main-horizontal',
  'main-vertical',
  'tiled',
];

export function buildLayout(name: string, ls: PaneNode[]): PaneNode {
  const n = ls.length;
  if (n === 1) return ls[0];
  const rest = ls.slice(1);
  if (name === 'even-horizontal') return { type: 'split', dir: 'h', children: ls };
  if (name === 'even-vertical') return { type: 'split', dir: 'v', children: ls };
  if (name === 'main-horizontal')
    return {
      type: 'split',
      dir: 'v',
      children: [ls[0], rest.length === 1 ? rest[0] : { type: 'split', dir: 'h', children: rest }],
    };
  if (name === 'main-vertical')
    return {
      type: 'split',
      dir: 'h',
      children: [ls[0], rest.length === 1 ? rest[0] : { type: 'split', dir: 'v', children: rest }],
    };
  const cols = Math.ceil(Math.sqrt(n));
  const rows: PaneNode[][] = [];
  for (let i = 0; i < n; i += cols) rows.push(ls.slice(i, i + cols));
  if (rows.length === 1) return { type: 'split', dir: 'h', children: rows[0] };
  return {
    type: 'split',
    dir: 'v',
    children: rows.map((r) => (r.length === 1 ? r[0] : { type: 'split', dir: 'h', children: r })),
  };
}

export function doLayout(s: TmuxState): OpResult {
  const w = win(s);
  w.layoutIdx = (w.layoutIdx + 1) % LAYOUTS.length;
  const ls: PaneNode[] = leavesOf(w.root).map((l) => ({ type: 'leaf', id: l.id, app: l.app }));
  w.root = buildLayout(LAYOUTS[w.layoutIdx], ls);
  w.zoomed = null;
  return { ok: true, msg: LAYOUTS[w.layoutIdx] };
}

// --- window ops ---
export function doNewWin(s: TmuxState): OpResult {
  const S = ses(s);
  const app = s.spawn.length ? s.spawn.shift()! : 'bash';
  S.windows.push(newWin(app));
  S.activeWin = S.windows.length - 1;
  return { ok: true };
}

export function doWinNav(s: TmuxState, d: number): OpResult {
  const S = ses(s);
  if (S.windows.length < 2) return { ok: false, msg: 'only one window' };
  S.activeWin = (S.activeWin + d + S.windows.length) % S.windows.length;
  return { ok: true };
}

export function doWinSel(s: TmuxState, i: number): OpResult {
  const S = ses(s);
  if (i >= S.windows.length) return { ok: false, msg: 'no window ' + i };
  S.activeWin = i;
  return { ok: true };
}

export function doRename(s: TmuxState, name: string): OpResult {
  if (!name) return { ok: false, msg: 'empty name' };
  const w = win(s);
  w.named = true;
  w.name = name;
  return { ok: true };
}

export function doKillWin(s: TmuxState): OpResult {
  const S = ses(s);
  if (S.windows.length <= 1) return { ok: false, msg: "can't kill the last window" };
  S.windows.splice(S.activeWin, 1);
  S.activeWin = Math.max(0, S.activeWin - 1);
  return { ok: true };
}

// --- session ops ---
export function doDetach(s: TmuxState): OpResult {
  s.detached = true;
  return { ok: true, msg: '[detached (from session ' + ses(s).name + ')]' };
}

export function doSesSel(s: TmuxState, name: string): OpResult {
  const i = s.sessions.findIndex((x) => x.name === name);
  if (i < 0) return { ok: false, msg: 'no session ' + name };
  s.activeSes = i;
  return { ok: true, msg: 'attached to ' + name };
}

export function applyKey(s: TmuxState, key: string): OpResult {
  if (s.detached) {
    if (key === 'ATTACH') {
      s.detached = false;
      return { ok: true, msg: 'attached' };
    }
    return { ok: false, msg: 'detached — press enter to attach' };
  }
  if (key.charAt(0) === ',') return doRename(s, key.slice(1).trim());
  if (key.slice(0, 2) === 's:') return doSesSel(s, key.slice(2));
  if (/^[0-9]$/.test(key)) return doWinSel(s, +key);
  switch (key) {
    case '%':
      return doSplit(s, 'h');
    case '"':
      return doSplit(s, 'v');
    case '{':
      return doSwap(s, -1);
    case '}':
      return doSwap(s, 1);
    case 'o':
      return doNext(s);
    case 'x':
      return doKill(s);
    case 'z':
      return doZoom(s);
    case ' ':
      return doLayout(s);
    case 'ArrowLeft':
      return doNav(s, -1, 0);
    case 'ArrowRight':
      return doNav(s, 1, 0);
    case 'ArrowUp':
      return doNav(s, 0, -1);
    case 'ArrowDown':
      return doNav(s, 0, 1);
    case 'c':
      return doNewWin(s);
    case 'n':
      return doWinNav(s, 1);
    case 'p':
      return doWinNav(s, -1);
    case '&':
      return doKillWin(s);
    case 'd':
      return doDetach(s);
    default:
      return { ok: false, msg: key + ' is not bound (yet)' };
  }
}
