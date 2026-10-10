import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FeedTail, type FeedTailState } from './feed-tail';

/** Un observateur qu'on déclenche à la main, et qui compte ses observations. */
class FakeObserver {
  static live: FakeObserver[] = [];
  static observed = 0;
  disconnected = false;

  constructor(private readonly callback: (entries: { isIntersecting: boolean }[]) => void) {
    FakeObserver.live.push(this);
  }
  observe(): void {
    FakeObserver.observed += 1;
  }
  disconnect(): void {
    this.disconnected = true;
  }
  fire(isIntersecting: boolean): void {
    this.callback([{ isIntersecting }]);
  }
}

function mount(state: FeedTailState) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(FeedTail);
  fixture.componentRef.setInput('state', state);
  let reached = 0;
  fixture.componentInstance.reached.subscribe(() => (reached += 1));
  fixture.detectChanges();
  return { fixture, reached: () => reached };
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeObserver.live = [];
  FakeObserver.observed = 0;
});

describe('le bas du fil', () => {
  it('demande la suite quand la sentinelle approche', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { reached } = mount('more');

    FakeObserver.live[0]?.fire(false);
    expect(reached()).toBe(0);
    FakeObserver.live[0]?.fire(true);
    expect(reached()).toBe(1);
  });

  it('se remet à observer à chaque retour à « more » — une page courte ne bloque pas le fil', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { fixture } = mount('more');
    fixture.componentRef.setInput('state', 'loading');
    fixture.detectChanges();
    expect(FakeObserver.live[0]?.disconnected).toBe(true);

    fixture.componentRef.setInput('state', 'more');
    fixture.detectChanges();
    expect(FakeObserver.observed).toBe(2);
  });

  it('n’observe rien hors de « more »', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    mount('end');
    expect(FakeObserver.observed).toBe(0);
  });

  it('garde le bouton de repli sans observateur', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { fixture, reached } = mount('more');
    const button = (fixture.nativeElement as HTMLElement).querySelector('button');

    button?.click();

    expect(button?.textContent?.trim()).toBe('Charger la suite');
    expect(reached()).toBe(1);
  });

  it('dit la fin du fonds', () => {
    const { fixture } = mount('end');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Fin du fonds');
  });
});
