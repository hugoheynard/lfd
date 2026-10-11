import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { MediaPaletteStripView, PaletteStripColumnView } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { PaletteStrip, columnLabel, columnsFor, rangeOf } from './palette-strip';

const WEEK: PaletteStripColumnView = {
  from: '2026-10-04T22:00:00.000Z',
  to: '2026-10-11T21:59:59.000Z',
  count: 12,
  palette: [{ hex: '#ffffff', share: 1, outlier: false }],
  sampleUrl: 'https://img/a.png',
};

// Les dates ne sont comparées qu'ENTRE ELLES et au fuseau, jamais à l'horloge.
describe('la frise des couleurs', () => {
  it('lit la plage d’une colonne en jours de Paris', () => {
    expect(rangeOf(WEEK)).toEqual({ from: '2026-10-05', to: '2026-10-11' });
    expect(columnLabel(WEEK)).toBe('5 octobre 2026 – 11 octobre 2026 · 12 photos');
  });

  it('dit un seul jour quand la plage n’en couvre qu’un', () => {
    const day = { ...WEEK, to: '2026-10-05T12:00:00.000Z', count: 1 };
    expect(columnLabel(day)).toBe('5 octobre 2026 · 1 photo');
  });

  it('ne descend pas sous trois pixels par colonne', () => {
    expect(columnsFor(900)).toBe(300);
    expect(columnsFor(2)).toBe(1);
  });

  it('dit le total et ce qui reste sans couleurs', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(PaletteStrip);
    const view: MediaPaletteStripView = { columns: [WEEK], total: 40, unpainted: 3 };
    fixture.componentRef.setInput('view', view);
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      '40 photos, dont 3 sans couleurs encore',
    );
  });

  it('rend la plage de la colonne cliquée, en jours de Paris (L11)', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(PaletteStrip);
    const host = fixture.nativeElement as HTMLElement;
    Object.defineProperty(host, 'clientWidth', { value: 300 });
    const second = { ...WEEK, from: '2026-10-11T22:00:00.000Z', to: '2026-10-18T21:00:00.000Z' };
    fixture.componentRef.setInput('view', { columns: [WEEK, second], total: 24, unpainted: 0 });
    const chosen: unknown[] = [];
    fixture.componentInstance.rangeChosen.subscribe((range) => chosen.push(range));
    await fixture.whenStable();

    const click = new MouseEvent('click');
    Object.defineProperty(click, 'offsetX', { value: 200 });
    host.querySelector('canvas')?.dispatchEvent(click);

    expect(chosen).toEqual([{ from: '2026-10-12', to: '2026-10-18' }]);
  });
});
