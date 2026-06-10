import { describe, expect, it } from 'vitest';
import { applyKey, cloneState, dispName, ses, sig, win } from './tmux-engine';
import { buildLevel, LEVELS } from './levels';

describe('buildLevel', () => {
  it('has 18 levels', () => {
    expect(LEVELS).toHaveLength(18);
  });

  it.each(LEVELS.map((def, i) => [i, def.name] as const))(
    'level %i (%s): solution applied to start reaches the target',
    (i) => {
      const { def, start, target, par } = buildLevel(i);
      const s = cloneState(start);
      def.solution.forEach((k) => {
        const r = applyKey(s, k);
        expect(r.ok).toBe(true);
      });
      expect(sig(s)).toBe(sig(target));
      expect(par).toBe(def.solution.length);
    },
  );

  it('is deterministic across calls (id counter resets)', () => {
    const a = buildLevel(9);
    const b = buildLevel(9);
    expect(sig(a.start)).toBe(sig(b.start));
    expect(sig(a.target)).toBe(sig(b.target));
    expect(JSON.stringify(a.start)).toBe(JSON.stringify(b.start));
  });

  it('level 17 includes the extra scratch session', () => {
    const { start, target } = buildLevel(16);
    expect(start.sessions.map((s) => s.name)).toEqual(['work', 'scratch']);
    expect(start.activeSes).toBe(0);
    expect(target.activeSes).toBe(1);
  });

  it('level 5 setup leaves two panes with bash active', () => {
    const { start } = buildLevel(4);
    expect(dispName(win(start))).toBe('bash');
  });

  it('level 15 setup leaves two windows with bash active', () => {
    const { start } = buildLevel(14);
    expect(ses(start).windows).toHaveLength(2);
    expect(ses(start).activeWin).toBe(1);
    expect(dispName(win(start))).toBe('bash');
  });

  it('level 16 target is detached', () => {
    const { target } = buildLevel(15);
    expect(target.detached).toBe(true);
    expect(sig(target)).toMatch(/^D\|/);
  });
});
