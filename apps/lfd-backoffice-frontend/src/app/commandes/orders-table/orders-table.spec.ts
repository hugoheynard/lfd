import { TestBed } from '@angular/core/testing';
import type { AdminOrderRow } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { OrdersTable } from './orders-table';

/**
 * Le tableau partagé : la liste de toutes les commandes l'ouvre en `wide`
 * (client et jour), l'onglet d'un compte non — et un clic rend la ligne, sans
 * que le tableau sache où elle mène.
 */

function row(over: Partial<AdminOrderRow> = {}): AdminOrderRow {
  return {
    id: 'o_1',
    orderNumber: 'CMD-1',
    placedAt: '2026-10-12T08:00:00.000Z',
    status: 'placed',
    paymentStatus: 'paid',
    fulfillmentMethod: 'delivery',
    fulfillmentDay: '2026-10-14',
    clientele: 'public',
    subtotalCents: 1000,
    vatCents: 55,
    totalCents: 1055,
    customerLabel: 'Léa Martin',
    companyId: null,
    companyDisplayName: null,
    origin: 'self_service',
    ...over,
  };
}

function render(rows: readonly AdminOrderRow[], wide: boolean) {
  const fixture = TestBed.createComponent(OrdersTable);
  fixture.componentRef.setInput('rows', rows);
  fixture.componentRef.setInput('caption', 'Commandes');
  fixture.componentRef.setInput('empty', { title: 'Aucune commande' });
  fixture.componentRef.setInput('wide', wide);
  fixture.detectChanges();
  return fixture;
}

function headers(el: HTMLElement): string[] {
  return [...el.querySelectorAll('th')].map((th) => (th.textContent ?? '').trim()).filter(Boolean);
}

describe('OrdersTable', () => {
  it('en large, dit qui a commandé et pour quand', () => {
    const el = render([row()], true).nativeElement as HTMLElement;
    expect(headers(el)).toEqual(
      expect.arrayContaining(['Commande', 'Client', 'Passée le', 'Pour le', 'Total TTC']),
    );
    expect(el.querySelector('fold-badge[data-clientele]')?.textContent).toContain('Particulier');
    expect(el.textContent).toContain('Livraison');
  });

  it("dans un compte, ni client ni jour : c'est le même partout", () => {
    const el = render([row()], false).nativeElement as HTMLElement;
    expect(headers(el)).not.toContain('Client');
    expect(headers(el)).not.toContain('Pour le');
  });

  it("une commande d'avant la distinction n'a pas de badge de clientèle", () => {
    const el = render([row({ clientele: null })], true).nativeElement as HTMLElement;
    expect(el.querySelector('fold-badge[data-clientele]')).toBeNull();
  });

  it('rend la ligne cliquée', () => {
    const fixture = render([row()], true);
    const opened: AdminOrderRow[] = [];
    fixture.componentInstance.opened.subscribe((r) => opened.push(r));
    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('tbody tr')?.click();
    expect(opened.map((r) => r.id)).toEqual(['o_1']);
  });
});
