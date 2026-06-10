import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('renders the topbar title and intro overlay', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#topbar h1')?.textContent).toContain('PANE WRANGLER');
    expect(el.querySelector('.overlay .card h2')?.textContent).toContain('PANE WRANGLER');
  });

  it('renders the live window and sidebar for level 1', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#lvlname')?.textContent).toContain('1 · First blood');
    expect(el.querySelectorAll('#curwin .pane')).toHaveLength(1);
    expect(el.querySelectorAll('#targetbox .pane')).toHaveLength(2);
    expect(el.querySelectorAll('.ldot')).toHaveLength(18);
  });
});
