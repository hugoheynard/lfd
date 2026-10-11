import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { FocalPoint } from '@lfd/pim-contracts';
import { describe, expect, it, vi } from 'vitest';

import { FocalSection } from './focal-section';

function section(focal: FocalPoint | null): FocalSection {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(FocalSection);
  fixture.componentRef.setInput('url', 'https://media.test/a.png');
  fixture.componentRef.setInput('focal', focal);
  fixture.detectChanges();
  return fixture.componentInstance;
}

/** Un VRAI clic : `currentTarget` n'est posé que pendant la propagation. */
function clickAt(screen: FocalSection, at: { x: number; y: number }): void {
  const target = document.createElement('span');
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: 0, y: 0, width: 200, height: 100 }),
  );
  target.addEventListener('click', (event) => {
    screen['point'](event);
  });
  target.dispatchEvent(new MouseEvent('click', { clientX: at.x, clientY: at.y }));
}

describe('aperçu et cadrage', () => {
  it('pose le point en fractions, et les cadres le suivent', () => {
    const screen = section(null);
    expect(screen['objectPosition']()).toBe('50% 50%');

    clickAt(screen, { x: 50, y: 75 });

    expect(screen.focal()).toEqual({ x: 0.25, y: 0.75 });
    expect(screen['objectPosition']()).toBe('25% 75%');
  });

  it('retire le point sans le remplacer par le centre', () => {
    const screen = section({ x: 0.2, y: 0.8 });

    screen['unpoint']();

    expect(screen.focal()).toBeNull();
  });
});
