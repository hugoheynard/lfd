import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { OrderRevisionEntryView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { AdminOrdersService } from '../orders.service';
import { OrderRevisionsCard } from './order-revisions-card';
import { revisionRowOf } from './revision-entry';

/** Des instants seulement affichés : aucun n'est comparé à l'horloge. */
const BY_CUSTOMER: OrderRevisionEntryView = {
  replacedRevision: 0,
  revisedAt: '2026-11-08T10:00:00.000Z',
  author: { kind: 'customer', name: 'Léa Martin' },
  changes: ['lines', 'note'],
  totalBeforeCents: 1_899,
  totalAfterCents: 3_798,
  replaced: {
    requestedDeliveryDate: '2026-11-10',
    fulfillmentMethod: 'pickup',
    pickupAddress: {
      label: 'Labo',
      ligne1: '5 rue du Four',
      ligne2: '',
      codePostal: '73150',
      ville: "Val d'Isère",
      pays: 'France',
    },
    deliveryAddress: null,
    window: { start: '07:00', end: '08:00' },
    note: '',
    subtotalCents: 2_000,
    discountCents: 200,
    deliveryFeeCents: 0,
    vatCents: 99,
    totalCents: 1_899,
    lines: [
      {
        sku: 'VIE-001',
        productName: 'Croissant',
        quantity: 10,
        saleUnit: 'piece',
        unitPriceMillicents: 200_000,
        vatRate: 5.5,
        lineTotalCents: 2_000,
      },
    ],
  },
};

const BY_STAFF: OrderRevisionEntryView = {
  ...BY_CUSTOMER,
  replacedRevision: 1,
  author: { kind: 'staff', name: null },
  changes: ['date'],
  totalBeforeCents: 3_798,
  totalAfterCents: 3_798,
  replaced: null,
};

async function boot(
  read: () => Promise<readonly OrderRevisionEntryView[]>,
): Promise<ComponentFixture<OrderRevisionsCard>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: AdminOrdersService, useValue: { revisions: () => read() } }],
  });
  const fixture = TestBed.createComponent(OrderRevisionsCard);
  fixture.componentRef.setInput('orderId', 'ord_1');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const el = (f: ComponentFixture<OrderRevisionsCard>) => f.nativeElement as HTMLElement;

describe('revisionRowOf', () => {
  it('dit la version, l’auteur, l’écart et ce qui a changé', () => {
    const row = revisionRowOf(BY_CUSTOMER);
    expect(row.title).toBe('Version d’origine');
    expect(row.meta).toContain('par Léa Martin (le client)');
    expect(row.difference).toContain('+');
    expect(row.changes).toBe('Articles et quantités, Note');
    expect(row.replaced?.route).toBe("Retrait : Labo — 5 rue du Four, 73150 Val d'Isère");
    expect(row.replaced?.when).toContain('07:00 – 08:00');
    expect(row.replaced?.lines[0]).toMatchObject({ name: 'Croissant', quantity: 10 });
  });

  /** P5 : « 1250 × Gravlax » se lisait en pièces. */
  it('dit une ligne au poids en kilos, et son prix au kilo', () => {
    const replaced = BY_CUSTOMER.replaced;
    const row = revisionRowOf({
      ...BY_CUSTOMER,
      replaced:
        replaced === null
          ? null
          : {
              ...replaced,
              lines: [
                {
                  sku: 'SAU',
                  productName: 'Gravlax',
                  quantity: 1_250,
                  saleUnit: 'weight',
                  unitPriceMillicents: 4_200_000,
                  vatRate: 5.5,
                  lineTotalCents: 5_250,
                },
              ],
            },
    });
    expect(row.replaced?.lines[0]).toMatchObject({ quantityLabel: '1,25 kg' });
    expect(row.replaced?.lines[0]?.unitPrice).toContain('/ kg');
  });

  it('un auteur que l’annuaire ne connaît plus reste anonyme, et un total égal le dit', () => {
    const row = revisionRowOf(BY_STAFF);
    expect(row.title).toBe('Version 1');
    expect(row.meta).toContain('personne inconnue (l’équipe)');
    expect(row.difference).toBe('Total inchangé');
    expect(row.replaced).toBeNull();
  });
});

describe('OrderRevisionsCard', () => {
  it('liste les versions, et la composition remplacée à la demande', async () => {
    const f = await boot(async () => [BY_STAFF, BY_CUSTOMER]);
    expect(el(f).querySelectorAll('[data-order-revision]')).toHaveLength(2);
    expect(el(f).querySelector('[data-order-revision-detail="0"]')?.textContent).toContain(
      'Croissant',
    );
    expect(el(f).querySelector('[data-order-revision-unreadable]')).not.toBeNull();
  });

  it('dit qu’une commande n’a jamais été modifiée', async () => {
    const f = await boot(async () => []);
    expect(el(f).querySelector('[data-order-revisions-empty]')).not.toBeNull();
  });

  it('garde l’échec dans la carte', async () => {
    const f = await boot(() => Promise.reject(new Error('panne')));
    expect(el(f).querySelector('[data-order-revisions-error]')).not.toBeNull();
  });
});
