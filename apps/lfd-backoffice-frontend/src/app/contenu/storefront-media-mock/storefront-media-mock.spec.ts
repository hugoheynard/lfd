import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type CarouselSettings, DEFAULT_CAROUSEL } from '../storefront-carousel';
import { StorefrontMediaMock } from './storefront-media-mock';

/**
 * La simulation du défilement : le numéro suit le rythme (premier plus long),
 * s'arrête au survol, et sans automatique les commandes font avancer.
 */
function setup(carousel: CarouselSettings | null) {
  const fixture = TestBed.createComponent(StorefrontMediaMock);
  fixture.componentRef.setInput('side', 'left');
  fixture.componentRef.setInput('fit', 'cover');
  fixture.componentRef.setInput('carousel', carousel);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const number = (): string => root.querySelector('.slide-number')?.textContent?.trim() ?? '';
  return { fixture, root, number };
}

describe('StorefrontMediaMock', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('un seul contenu : l’icône image, ni numéro ni commandes', () => {
    const { root } = setup(null);
    expect(root.querySelector('.slide-number')).toBeNull();
    expect(root.querySelector('.dots')).toBeNull();
  });

  it('automatique : 8 s sur le premier, puis 5 s, et le point actif suit', () => {
    const { fixture, root, number } = setup({ ...DEFAULT_CAROUSEL, autoplay: true });
    expect(number()).toBe('1');
    vi.advanceTimersByTime(7_750);
    fixture.detectChanges();
    expect(number()).toBe('1');
    vi.advanceTimersByTime(250);
    fixture.detectChanges();
    expect(number()).toBe('2');
    expect(root.querySelectorAll('.dot')[1]?.classList.contains('active')).toBe(true);
    expect(root.textContent).toContain('auto · 8 s puis 5 s');
  });

  it('en pause au survol', () => {
    const { fixture, root, number } = setup({ ...DEFAULT_CAROUSEL, autoplay: true });
    root.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(20_000);
    fixture.detectChanges();
    expect(number()).toBe('1');
    expect(root.textContent).toContain('en pause');
  });

  it('sans automatique : le numéro reste, les points font passer', () => {
    const { fixture, root, number } = setup({ ...DEFAULT_CAROUSEL });
    vi.advanceTimersByTime(20_000);
    fixture.detectChanges();
    expect(number()).toBe('1');
    root.querySelectorAll<HTMLButtonElement>('.dot')[2]?.click();
    fixture.detectChanges();
    expect(number()).toBe('3');
  });

  it('le minuteur s’arrête à la destruction', () => {
    const { fixture } = setup({ ...DEFAULT_CAROUSEL, autoplay: true });
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    fixture.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });
});
