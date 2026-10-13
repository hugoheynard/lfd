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
