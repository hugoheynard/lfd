import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ShopQuoteRemovedLineView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { ClientCart } from '../client-cart.service';
import { RemovedLinesCallout } from './removed-lines-callout';

/** Le motif d'une ligne retirée au devis (`plan-changer-l-unite-de-vente.md`, § 8). */
function render(lines: readonly ShopQuoteRemovedLineView[]): HTMLElement {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: ClientCart, useValue: { removedLines: signal(lines) } }],
  });
  const fixture = TestBed.createComponent(RemovedLinesCallout);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('RemovedLinesCallout', () => {
  it('dit, article par article, dans quelle unité il se vend désormais et quoi faire', () => {
    const host = render([
      {
        sku: 'VRC-001',
        name: 'Graines au chocolat',
        reason: 'sale_unit_changed',
        saleUnit: 'weight',
      },
      { sku: 'SAC-001', name: 'Sachet', reason: 'sale_unit_changed', saleUnit: 'piece' },
    ]);

    const said = [...host.querySelectorAll('[data-removed-line]')].map((node) =>
      node.textContent?.trim(),
    );
    expect(said).toEqual([
      'L’article Graines au chocolat se vend désormais au poids : ajoutez-le de nouveau.',
      'L’article Sachet se vend désormais à la pièce : ajoutez-le de nouveau.',
    ]);
  });

  it('ne montre rien sans ligne retirée', () => {
    expect(render([]).querySelector('fold-callout')).toBeNull();
  });
});
