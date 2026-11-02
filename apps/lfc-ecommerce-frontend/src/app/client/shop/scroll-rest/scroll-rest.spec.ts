import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SCROLL_REST_MS, ScrollRest } from './scroll-rest';

describe('ScrollRest', () => {
  let rest: ScrollRest;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        ScrollRest,
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
      ],
    });
    rest = TestBed.inject(ScrollRest);
  });

  afterEach(() => vi.useRealTimers());

  it('masque pendant le défilement et rend la barre une seconde après le dernier cran', () => {
    rest.moved();
    expect(rest.scrolling()).toBe(true);

    vi.advanceTimersByTime(SCROLL_REST_MS - 100);
    rest.moved();
    vi.advanceTimersByTime(SCROLL_REST_MS - 1);
    expect(rest.scrolling()).toBe(true);

    vi.advanceTimersByTime(1);
    expect(rest.scrolling()).toBe(false);
  });

  it('ne masque rien tant que la retenue tient — focus dedans, ou bureau', () => {
    let held = true;
    rest.holdWhile(() => held);
    rest.moved();
    expect(rest.scrolling()).toBe(false);

    held = false;
    rest.moved();
    expect(rest.scrolling()).toBe(true);
    held = true;
    rest.moved();
    expect(rest.scrolling()).toBe(false);
  });
});
