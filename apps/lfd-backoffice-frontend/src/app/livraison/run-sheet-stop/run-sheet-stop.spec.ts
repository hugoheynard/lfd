import { TestBed } from '@angular/core/testing';
import type { DeliveryRunSheetStopView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { stopOf } from '../run-sheet.fixture';
import { RunSheetStop } from './run-sheet-stop';

function render(stop: DeliveryRunSheetStopView): HTMLElement {
  const fixture = TestBed.createComponent(RunSheetStop);
  fixture.componentRef.setInput('stop', stop);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('RunSheetStop — la couleur de l’arrêt (plan du tri et des couleurs, L5)', () => {
  it('pose le carré de la couleur servie après l’horaire', () => {
    const square = render(stopOf({ color: '#1e88e5' })).querySelector<HTMLElement>(
      '[data-stop-color]',
    );

    expect(square?.style.backgroundColor).toBe('rgb(30, 136, 229)');
  });

  it('sans couleur servie : aucun carré', () => {
    expect(render(stopOf()).querySelector('[data-stop-color]')).toBeNull();
  });
});

describe('RunSheetStop — un départ incomplet décidé (2026-10-25)', () => {
  const text = (host: HTMLElement): string => (host.textContent ?? '').replace(/\s+/g, ' ');

  it('dit « Départ incomplet. Ces articles ne partent pas » et chaque article', () => {
    const host = render(
      stopOf({
        totalUnits: 1,
        shortfall: {
          remainder: 'abandoned',
          lines: [{ sku: 'CRO', productName: 'Croissant', quantity: 2 }],
        },
      }),
    );

    expect(text(host)).toContain('Départ incomplet. Ces articles ne partent pas');
    expect(text(host)).toContain('2 Croissant');
    expect(text(host)).not.toMatch(/prévenez|prévenir/i);
  });

  it('sans décision, rien', () => {
    expect(render(stopOf({ shortfall: null })).querySelector('[data-missing-items]')).toBeNull();
    expect(render(stopOf()).querySelector('[data-missing-items]')).toBeNull();
  });
});
