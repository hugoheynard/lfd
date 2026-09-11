import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import type { OrderLineView, OrderView } from '@lfd/contracts';

import { AdminOrdersService } from '../../commandes/orders.service';
import { BonPanel, type BonPanelData } from './bon-panel';

/**
 * 🔴 **Ce que ces cas tiennent, c'est l'ABSENCE de montant.**
 *
 * On ne facture pas au comptoir. Un total affiché pendant qu'on tend un sac se
 * lit comme une somme à encaisser, et quelqu'un finit par la demander. Le bon
 * porte des quantités, des noms et des références — jamais un euro, jamais un
 * centime, quelle que soit la commande.
 *
 * Et l'absence est **dite** : quelqu'un qui cherche un total doit savoir qu'il
 * n'y en a pas ici, plutôt que de croire à un oubli d'affichage.
 */

function line(over: Partial<OrderLineView> = {}): OrderLineView {
  return {
    sku: 'CROI-NAT',
    productName: 'Croissant nature',
    unitPriceMillicents: 95_000,
    vatRate: 5.5,
    quantity: 12,
    lineTotalCents: 1_140,
    pricing: null,
    allergens: null,
    ...over,
  };
}

function order(over: Partial<OrderView> = {}): OrderView {
  return {
    id: 'ord_1',
    orderNumber: 'CMD-1042',
    status: 'placed',
    paymentStatus: 'paid',
    requestedDeliveryDate: '2026-09-11',
    fulfillmentMethod: 'pickup',
    deliveryAddressId: null,
    deliveryAddress: null,
    pickupAddress: null,
    fulfillment: {
      window: { value: { start: '06:00', end: '08:00' }, source: 'override' },
      contact: { value: null, source: 'default' },
      signatureRequired: { value: false, source: 'default' },
    },
    note: '',
    subtotalCents: 1_140,
    discountCents: 0,
    discountAdjustment: null,
    deliveryFeeCents: 0,
    deliveryFeeAdjustment: null,
    lateFeeCents: 0,
    lateFeeAdjustment: null,
    totalCents: 1_140,
    vatShares: [],
    lines: [line()],
    createdAt: '2026-09-10T08:00:00.000Z',
    readyAt: null,
    handedOverAt: null,
    handoverToken: null,
    ...over,
  } as OrderView;
}

class FakeOrders {
  readonly downloaded: string[] = [];

  sheetPdf(id: string): Promise<Blob> {
    this.downloaded.push(id);
    return Promise.resolve(new Blob(['%PDF-1.7'], { type: 'application/pdf' }));
  }
}

async function render(data: BonPanelData): Promise<ComponentFixture<BonPanel>> {
  TestBed.configureTestingModule({
    imports: [BonPanel],
    providers: [
      { provide: AdminOrdersService, useValue: new FakeOrders() },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, () => undefined) },
    ],
  });
  const fixture: ComponentFixture<BonPanel> = TestBed.createComponent(BonPanel);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<BonPanel>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

const data = (over: Partial<BonPanelData> = {}): BonPanelData => ({
  order: order(),
  pickupLabel: 'Le Labo',
  customerLabel: 'Boulangerie Marin',
  ...over,
});

describe('BonPanel', () => {
  it('porte ce qu’on coche : quantités, articles, références', async () => {
    const fixture = await render(data());

    expect(text(fixture)).toContain('Boulangerie Marin');
    expect(text(fixture)).toContain('CMD-1042');
    expect(text(fixture)).toContain('Croissant nature');
    expect(text(fixture)).toContain('CROI-NAT');
    expect(text(fixture)).toContain('12 pièces au total');
  });

  it('🔴 n’imprime AUCUN montant, et le dit', async () => {
    const fixture = await render(data());
    const body = text(fixture);

    // Les montants de la commande, sous toutes leurs graphies possibles.
    expect(body).not.toContain('11,40');
    expect(body).not.toContain('€');
    expect(body).not.toContain('1140');
    // Et l'absence est annoncée, plutôt que laissée à l'interprétation.
    expect(body).toContain('Aucun montant');
  });

  it('🔴 sans tranche demandée, n’invente aucune heure', async () => {
    const fixture = await render({
      ...data(),
      order: order({
        fulfillment: {
          window: { value: null, source: 'default' },
          contact: { value: null, source: 'default' },
          signatureRequired: { value: false, source: 'default' },
        },
      }),
    });

    expect(text(fixture)).toContain('Aucune tranche demandée');
  });

  it('nomme l’acheminement ET son lieu — jamais l’un sans l’autre', async () => {
    const fixture = await render(data());

    expect(text(fixture)).toContain('Retrait · Le Labo');
  });

  it('🔴 le PDF est annoncé comme TARIFÉ : on ne tire pas un papier à prix sans le savoir', async () => {
    const fixture = await render(data());

    expect(text(fixture)).toContain('tarifé');
  });

  it('reporte la note du client quand il y en a une', async () => {
    const fixture = await render({ ...data(), order: order({ note: 'Livrer par la cour' }) });

    expect(text(fixture)).toContain('Livrer par la cour');
  });
});
