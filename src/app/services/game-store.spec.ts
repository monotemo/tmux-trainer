import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { dispName, leavesOf, win } from '../engine/tmux-engine';
import { GameStore } from './game-store';

function kd(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, cancelable: true, ...init });
}

function freshStore(): GameStore {
  localStorage.clear();
  const store = TestBed.inject(GameStore);
  store.handleKey(kd('Enter')); // dismiss intro overlay
  return store;
}

describe('GameStore keyboard cascade', () => {
  beforeEach(() => localStorage.clear());

  it('arms on ctrl+b and runs the next key as a command', () => {
    const store = freshStore();
    store.handleKey(kd('b', { ctrlKey: true }));
    expect(store.armed()).toBe(true);
    store.handleKey(kd('%'));
    expect(store.armed()).toBe(false);
    expect(store.moves()).toBe(1);
    expect(leavesOf(win(store.state()).root)).toHaveLength(2);
  });

  it('escape cancels an armed prefix', () => {
    const store = freshStore();
    store.handleKey(kd('b', { ctrlKey: true }));
    store.handleKey(kd('Escape'));
    expect(store.armed()).toBe(false);
    expect(store.msg()?.text).toBe('prefix cancelled');
    expect(store.moves()).toBe(0);
  });

  it('nags when a command key is pressed without the prefix', () => {
    const store = freshStore();
    store.handleKey(kd('%'));
    expect(store.moves()).toBe(0);
    expect(store.msg()).toEqual({ text: 'prefix first: ctrl+b, then %', err: true });
  });

  it('kill asks for confirmation and y confirms', () => {
    const store = freshStore();
    store.loadLevel(4); // level 5: two panes, bash active
    store.handleKey(kd('b', { ctrlKey: true }));
    store.handleKey(kd('x'));
    expect(store.confirming()).toEqual({ cmd: 'x', label: 'kill-pane? (y/n)' });
    store.handleKey(kd('y'));
    expect(store.confirming()).toBeNull();
    expect(leavesOf(win(store.state()).root)).toHaveLength(1);
  });

  it('n cancels the confirmation without side effects', () => {
    const store = freshStore();
    store.loadLevel(4);
    store.handleKey(kd('b', { ctrlKey: true }));
    store.handleKey(kd('x'));
    store.handleKey(kd('n'));
    expect(store.confirming()).toBeNull();
    expect(store.msg()?.text).toBe('kill cancelled');
    expect(leavesOf(win(store.state()).root)).toHaveLength(2);
  });

  it('any other key cancels the confirmation AND performs its normal role', () => {
    const store = freshStore();
    store.loadLevel(4);
    store.handleKey(kd('b', { ctrlKey: true }));
    store.handleKey(kd('x'));
    expect(store.confirming()).not.toBeNull();
    // r falls through the cancelled prompt and restarts the level
    store.handleKey(kd('r'));
    expect(store.confirming()).toBeNull();
    expect(store.msg()?.text).toBe('level restarted');
    // ctrl+b falls through a fresh prompt and arms the prefix
    store.handleKey(kd('b', { ctrlKey: true }));
    store.handleKey(kd('x'));
    store.handleKey(kd('b', { ctrlKey: true }));
    expect(store.confirming()).toBeNull();
    expect(store.armed()).toBe(true);
  });

  it('rename buffer edits, caps at 16 chars, and applies on Enter', () => {
    const store = freshStore();
    store.loadLevel(13); // level 14: rename to "build"
    store.handleKey(kd('b', { ctrlKey: true }));
    store.handleKey(kd(','));
    expect(store.renaming()).toEqual({ buf: 'vim' });
    for (let i = 0; i < 3; i++) store.handleKey(kd('Backspace'));
    for (const ch of 'buildbuildbuildbuild') store.handleKey(kd(ch));
    expect(store.renaming()?.buf).toBe('buildbuildbuildb');
    for (let i = 0; i < 11; i++) store.handleKey(kd('Backspace'));
    store.handleKey(kd('Enter'));
    expect(store.renaming()).toBeNull();
    expect(dispName(win(store.state()))).toBe('build');
  });

  it('escape cancels a rename', () => {
    const store = freshStore();
    store.handleKey(kd('b', { ctrlKey: true }));
    store.handleKey(kd(','));
    store.handleKey(kd('Escape'));
    expect(store.renaming()).toBeNull();
    expect(store.msg()?.text).toBe('rename cancelled');
  });

  it('session chooser navigates with arrows and attaches on Enter', () => {
    const store = freshStore();
    store.loadLevel(16); // level 17: work + scratch sessions
    store.handleKey(kd('b', { ctrlKey: true }));
    store.handleKey(kd('s'));
    expect(store.choosing()).toEqual({ idx: 1 });
    store.handleKey(kd('ArrowDown'));
    expect(store.choosing()).toEqual({ idx: 0 });
    store.handleKey(kd('ArrowUp'));
    store.handleKey(kd('Enter'));
    expect(store.choosing()).toBeNull();
    expect(store.state().activeSes).toBe(1);
  });

  it('q cancels the chooser', () => {
    const store = freshStore();
    store.loadLevel(16);
    store.handleKey(kd('b', { ctrlKey: true }));
    store.handleKey(kd('s'));
    store.handleKey(kd('q'));
    expect(store.choosing()).toBeNull();
    expect(store.state().activeSes).toBe(0);
  });

  it('detached state re-attaches on Enter without counting a move', () => {
    const store = freshStore();
    store.loadLevel(17); // level 18: detaching alone does not win
    store.handleKey(kd('b', { ctrlKey: true }));
    store.handleKey(kd('d'));
    expect(store.state().detached).toBe(true);
    expect(store.moves()).toBe(1);
    store.handleKey(kd('%')); // ignored while detached
    expect(store.moves()).toBe(1);
    store.handleKey(kd('Enter'));
    expect(store.state().detached).toBe(false);
    expect(store.moves()).toBe(1); // re-attaching is free
  });

  it('detaching on level 16 wins and blocks input while flying', () => {
    const store = freshStore();
    store.loadLevel(15);
    store.handleKey(kd('b', { ctrlKey: true }));
    store.handleKey(kd('d'));
    expect(store.state().detached).toBe(true);
    expect(store.flying()).toBe(true);
    store.handleKey(kd('Enter')); // ignored while flying
    expect(store.state().detached).toBe(true);
  });

  it('ignores bare modifier keys while armed', () => {
    const store = freshStore();
    store.handleKey(kd('b', { ctrlKey: true }));
    store.handleKey(kd('Control'));
    store.handleKey(kd('Shift'));
    expect(store.armed()).toBe(true);
  });
});
