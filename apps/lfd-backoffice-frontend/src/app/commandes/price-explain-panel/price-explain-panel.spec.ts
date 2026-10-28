import { TestBed } from '@angular/core/testing';
import type { OrderLinePricingTrace, OrderLineView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { AdminOrdersService } from '../orders.service';
import { PriceExplainPanel, type PriceExplainPanelData } from './price-explain-panel';

const TRACE: OrderLinePricingTrace = {
  basePriceMillicents: 200_000,
  steps: [
    {
      stage: 'mercuriale',
      ruleId: 'merc',
      label: 'Mercuriale Dupont',
      scope: { type: 'global', id: null },
      resultMillicents: 180_000,
      supersedes: [],
    },
  ],
  floored: false,
  clampedToZero: false,
  floorDecision: null,
  commitment: null,
  rejected: [],
};

const LINE: OrderLineView = {
  sku: 'VIE-001',
  productName: 'Croissant',
  unitPriceMillicents: 180_000,
  vatRate: 5.5,
  quantity: 12,
  saleUnit: 'piece',
  lineTotalCents: 2_160,
  unitPriceTtcCents: null,
  lineTotalTtcCents: null,
  pricing: TRACE,
  allergens: null,
};

function mount(): { el: HTMLElement; dismiss: ReturnType<typeof vi.fn> } {
  const dismiss = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, dismiss) },
      {
        provide: AdminOrdersService,
        useValue: {
          lineRules: () => Promise.resolve({ at: '2026-03-10T09:00:00.000Z', rules: [] }),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(PriceExplainPanel);
  const data: PriceExplainPanelData = { line: LINE, orderId: 'ord_1' };
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  return { el: fixture.nativeElement as HTMLElement, dismiss };
}

describe('PriceExplainPanel', () => {
  it("s'ouvre sur le chemin du prix de la ligne, nommée dans l'en-tête", () => {
    const { el } = mount();
    expect(el.querySelector('fold-panel-header')?.textContent).toContain('Chemin du prix');
    expect(el.querySelector('fold-panel-header')?.textContent).toContain('Croissant');
    expect(el.querySelector('fold-panel-body app-price-explain')).not.toBeNull();
  });

  it('la croix du chemin du prix referme le panneau', () => {
    const { el, dismiss } = mount();
    const cross = el.querySelector<HTMLButtonElement>(
      'button[aria-label="Refermer le chemin du prix"]',
    );
    cross?.click();
    expect(cross).not.toBeNull();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
