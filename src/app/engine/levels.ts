import { applyKey, cloneState, newState, newWin, resetIds } from './tmux-engine';
import { BuiltLevel, LevelDef } from './tmux-types';

export const APPCOLOR: Record<string, string> = {
  vim: '#7aa2f7',
  node: '#9ece6a',
  htop: '#e0af68',
  logs: '#bb9af7',
  bash: '#f7768e',
  ssh: '#7dcfff',
};

export const PBODY: Record<string, string> = {
  vim: '~\n~\n~\n~\n-- NORMAL --',
  node: '> uptime()\n42d 3h\n> _',
  htop: '',
  logs: 'INFO  server up\nINFO  GET /  200\nWARN  slow query\nINFO  GET /api 200',
  bash: '$ make test\nok  12 passed\n$ _',
  ssh: 'casey@remote:~$ _',
};

export const HTOP_BARS = [72, 38, 55, 20];

export const ALLKEYS: [string, string][] = [
  ['%', 'split left/right'],
  ['"', 'split top/bottom'],
  ['←↑↓→', 'move between panes'],
  ['o', 'next pane'],
  ['x', 'kill pane (y/n)'],
  ['{', 'swap backward'],
  ['}', 'swap forward'],
  ['z', 'zoom pane'],
  ['space', 'cycle layouts'],
  ['c', 'new window'],
  ['n / p', 'next / prev window'],
  ['0-9', 'select window'],
  [',', 'rename window'],
  ['&', 'kill window (y/n)'],
  ['d', 'detach'],
  ['s', 'choose session'],
];

export const LEVELS: LevelDef[] = [
  // act one: panes
  {
    name: '1 · First blood',
    spawn: ['node'],
    setup: [],
    solution: ['%'],
    intro:
      'Press ctrl+b, release, then %. That splits the pane left and right. The new pane is the active one (green border).',
    teach: [['%', 'split left/right']],
  },
  {
    name: '2 · The other one',
    spawn: ['htop'],
    setup: [],
    solution: ['"'],
    intro: 'ctrl+b then " splits top and bottom. Yes, the key is a double quote. Blame 1987.',
    teach: [['"', 'split top/bottom']],
  },
  {
    name: '3 · Splits nest',
    spawn: ['node', 'htop'],
    setup: [],
    solution: ['%', '"'],
    intro:
      'Splits apply to the active pane, and the new pane becomes active. Chain two splits to match the target.',
    teach: [],
  },
  {
    name: '4 · Get around',
    spawn: ['logs', 'htop'],
    setup: [],
    solution: ['%', 'ArrowLeft', '"'],
    intro:
      'ctrl+b plus an arrow key moves you between panes. ctrl+b o cycles to the next pane in order. Split, move back left, split again.',
    teach: [
      ['←↑↓→', 'move between panes'],
      ['o', 'next pane'],
    ],
  },
  {
    name: '5 · Kill the noise',
    spawn: ['bash'],
    setup: ['%'],
    solution: ['x'],
    intro:
      'A stray shell snuck in. ctrl+b x kills the active pane — tmux asks first, so press y to confirm.',
    teach: [['x', 'kill pane (y/n)']],
  },
  {
    name: '6 · Musical panes',
    spawn: ['htop'],
    setup: ['%'],
    solution: ['{'],
    intro:
      'Right apps, wrong seats. ctrl+b { drags the active pane backward through the order; } drags it forward.',
    teach: [
      ['{', 'swap backward'],
      ['}', 'swap forward'],
    ],
  },
  {
    name: '7 · Zoom in',
    spawn: ['node', 'htop'],
    setup: ['%', '"'],
    solution: ['ArrowLeft', 'z'],
    intro:
      'ctrl+b z zooms the active pane to fill the window. Press it again to unzoom. Get to vim, then zoom it.',
    teach: [['z', 'zoom pane']],
  },
  {
    name: '8 · Shapeshifter',
    spawn: ['node', 'htop'],
    setup: ['%', '%'],
    solution: [' '],
    intro:
      'ctrl+b space cycles preset layouts: even-horizontal, even-vertical, main-horizontal, main-vertical, tiled. One press fixes this lopsided mess.',
    teach: [['space', 'cycle layouts']],
  },
  {
    name: '9 · Cleanup crew',
    spawn: ['bash', 'logs', 'htop'],
    setup: ['%', '%'],
    solution: ['ArrowLeft', 'x', 'ArrowRight', '"'],
    intro:
      'Combine your moves: hunt down the bash pane, kill it, then build the target from what remains.',
    teach: [],
  },
  {
    name: '10 · Perfect quarters',
    spawn: ['node', 'htop', 'logs'],
    setup: [],
    solution: ['%', '"', 'ArrowLeft', '"'],
    intro:
      'Four panes, four quarters. Mind the split order — the spawn queue is vim, node, htop, logs.',
    teach: [],
  },
  // act two: windows
  {
    name: '11 · Open a window',
    spawn: ['node'],
    setup: [],
    solution: ['c'],
    intro:
      'ctrl+b c opens a new window: a fresh full-screen workspace. Look behind the live window — the stack is your session now.',
    teach: [['c', 'new window']],
  },
  {
    name: '12 · Next, previous',
    spawn: ['logs', 'htop'],
    setup: ['c', 'c', '0'],
    solution: ['p'],
    intro:
      'ctrl+b n goes to the next window, p to the previous. Both wrap around the ends — the fastest route to htop is backward.',
    teach: [['n / p', 'next / prev window']],
  },
  {
    name: '13 · By the numbers',
    spawn: ['logs', 'htop', 'node'],
    setup: ['c', 'c', 'c'],
    solution: ['1'],
    intro:
      'Each window has a number, right there in the status bar. ctrl+b plus the digit jumps straight to it. No surfing.',
    teach: [['0-9', 'select window']],
  },
  {
    name: '14 · Say my name',
    spawn: [],
    setup: [],
    solution: [',build'],
    intro:
      'ctrl+b , renames the active window. Backspace the old name, type "build", press enter. Named windows stop auto-renaming.',
    teach: [[',', 'rename window']],
  },
  {
    name: '15 · Too many tabs',
    spawn: ['bash'],
    setup: ['c'],
    solution: ['&'],
    intro:
      'ctrl+b & kills the whole window, panes and all. Like x, it asks first. Get rid of that bash window.',
    teach: [['&', 'kill window (y/n)']],
  },
  // act three: sessions
  {
    name: '16 · Cut the cord',
    spawn: [],
    setup: [],
    solution: ['d'],
    intro:
      'ctrl+b d detaches. The session keeps running in the background; you drop back to your shell. In this game, enter re-attaches.',
    teach: [['d', 'detach']],
  },
  {
    name: '17 · Session hop',
    spawn: [],
    extra: [{ name: 'scratch', app: 'ssh' }],
    setup: [],
    solution: ['s:scratch'],
    intro:
      'One tmux server can hold many sessions. ctrl+b s lists them — pick one with the arrows, attach with enter. Move to scratch.',
    teach: [['s', 'choose session']],
  },
  {
    name: '18 · Ship it and leave',
    spawn: ['node', 'htop'],
    setup: [],
    solution: ['c', ',tests', '%', 'd'],
    intro:
      'The closer: open a new window, rename it "tests", split it, then detach and walk away. tmux keeps it all running.',
    teach: [],
  },
];

export function buildLevel(i: number): BuiltLevel {
  const def = LEVELS[i];
  resetIds();
  const s = newState('work', 'vim', def.spawn);
  (def.extra || []).forEach((x) => {
    s.sessions.push({ name: x.name, windows: [newWin(x.app)], activeWin: 0 });
  });
  def.setup.forEach((k) => applyKey(s, k));
  const start = cloneState(s);
  const t = cloneState(s);
  def.solution.forEach((k) => applyKey(t, k));
  return { def, start, target: t, par: def.solution.length };
}
