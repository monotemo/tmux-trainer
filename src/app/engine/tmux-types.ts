export interface PaneLeaf {
  type: 'leaf';
  id: number;
  app: string;
}

export interface PaneSplit {
  type: 'split';
  dir: 'h' | 'v';
  children: PaneNode[];
}

export type PaneNode = PaneLeaf | PaneSplit;

export interface TmuxWindow {
  named: boolean;
  name: string;
  root: PaneNode;
  activeId: number;
  zoomed: number | null;
  layoutIdx: number;
}

export interface TmuxSession {
  name: string;
  windows: TmuxWindow[];
  activeWin: number;
}

export interface TmuxState {
  sessions: TmuxSession[];
  activeSes: number;
  detached: boolean;
  spawn: string[];
}

export interface OpResult {
  ok: boolean;
  msg?: string;
}

export interface Rect {
  id: number;
  app: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LevelDef {
  name: string;
  spawn: string[];
  extra?: { name: string; app: string }[];
  setup: string[];
  solution: string[];
  intro: string;
  teach: [string, string][];
}

export interface BuiltLevel {
  def: LevelDef;
  start: TmuxState;
  target: TmuxState;
  par: number;
}
