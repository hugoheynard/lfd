import { TestBed } from '@angular/core/testing';
import type { CompanyOrderSummaryView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { BOTTOM, ORDERS_PRETAX, SUMMARY } from '../order-summary.fixture';
import { OrderSummaryOrders } from './order-summary-orders';

/**
 * Les bons de commande inclus (plan
 * `documentation/commandes/boutique/plan-recapitulatif-des-commandes.md`, §10) : le HT
 * de chaque bon, leur somme, l'écart expliqué — jamais de TVA par bon.
 */
function render(summary: CompanyOrderSummaryView): HTMLElement {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [OrderSummaryOrders] });
  const fixture = TestBed.createComponent(OrderSummaryOrders);
  fixture.componentRef.setInput('summary', summary);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const text = (host: Element | null): string => (host?.textContent ?? '').replace(/\s+/gu, ' ');

describe('OrderSummaryOrders — les bons inclus', () => {
  it('liste chaque bon : référence, jour, mode, auteur et HT du bon', () => {
    const shown = text(render(SUMMARY));

    expect(shown).toContain('Bons de commande inclus');
    expect(shown).toContain('CMD-001');
    expect(shown).toContain('Livraison');
    expect(shown).toContain('l’équipe');
    expect(shown).toContain('63,00 €');
    expect(shown).toContain('CMD-002');
    expect(shown).toContain('sans date');
    expect(shown).toContain('Retrait');
    expect(shown).toContain('Léa Martin');
    expect(shown).not.toContain('TTC');
  });

  it('sous la liste, la somme des bons et l’écart EXPLIQUÉ avec le sous-total HT', () => {
    const shown = text(render(SUMMARY));

    expect(shown).toContain('Total HT des bons');
    expect(shown).toContain('115,50 €');
    expect(shown).toContain('Écart avec le sous-total HT : remises, livraison');
    expect(shown).toContain('-4,50 €');
  });

  it('sans écart, aucune ligne d’écart', () => {
    const company = SUMMARY.companies[0];
    if (company === undefined) {
      throw new Error('fixture sans société');
    }
    const even = { pretaxCents: 12_000, gapCents: 0, cappedDiscountCents: 0 };
    const shown = text(
      render({
        ...SUMMARY,
        companies: [{ ...company, ordersPretax: even }],
        total: { ...SUMMARY.total, ordersPretax: even },
      }),
    );

    expect(shown).not.toContain('Écart');
  });

  it('plusieurs sociétés : une table chacune, puis la somme de tous les bons', () => {
    const site = {
      companyId: 'co_2',
      name: 'Site Est',
      orderCount: 1,
      products: [],
      bottom: BOTTOM,
      ordersPretax: ORDERS_PRETAX,
      orders: [],
    };
    const host = render({ ...SUMMARY, companies: [...SUMMARY.companies, site] });

    expect(host.querySelector('[data-summary-orders-company="co_2"]')).not.toBeNull();
    expect(text(host.querySelector('[data-summary-orders-total]'))).toContain(
      'Total HT des bons — Total général',
    );
  });

  it('aucune commande comptée : rien', () => {
    const host = render({ ...SUMMARY, companies: [] });

    expect(host.querySelector('[data-summary-orders]')).toBeNull();
  });
});
