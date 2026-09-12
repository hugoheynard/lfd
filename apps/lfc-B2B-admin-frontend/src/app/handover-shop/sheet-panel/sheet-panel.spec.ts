import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import type { OrderHandoverLine, OrderHandoverView } from '@lfd/contracts';

import { AdminOrdersService } from '../../commandes/orders.service';
import { SheetPanel, type SheetPanelData } from './sheet-panel';

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
 *
 * 🔴 Depuis le 2026-09-11, ces cas ne sont plus la seule chose qui tient la
 * promesse : le panneau reçoit une `OrderHandoverView`, où **aucun montant
 * n'existe**. Le gabarit ne peut plus en afficher un, même par accident. Ces
 * cas gardent leur valeur pour l'autre moitié — que l'absence soit DITE — et
 * comme garde-fou le jour où quelqu'un voudrait réélargir la vue.
 *
 * Le fixture le montre au passage : il n'y a plus un seul prix à écrire dedans.
 */

function line(over: Partial<OrderHandoverLine> = {}): OrderHandoverLine {
  return {
    sku: 'CROI-NAT',
    productName: 'Croissant nature',
    quantity: 12,
    ...over,
  };
}

function order(over: Partial<OrderHandoverView> = {}): OrderHandoverView {
  return {
    orderId: 'ord_1',
    orderNumber: 'CMD-1042',
    customerLabel: 'Boulangerie Marin',
    placedAt: '2026-09-10T08:00:00.000Z',
    requestedDeliveryDate: '2026-09-11',
    pickupLabel: 'Le Labo',
    fulfillmentMethod: 'pickup',
    note: '',
    totalUnits: 12,
    lines: [line()],
    handedOverAt: null,
    handedOverBy: null,
    handedOverVia: null,
    blockedReason: null,
    ...over,
  };
}

class FakeOrders {
  readonly downloaded: string[] = [];

  sheetPdf(id: string): Promise<Blob> {
    this.downloaded.push(id);
    return Promise.resolve(new Blob(['%PDF-1.7'], { type: 'application/pdf' }));
  }
}

async function render(data: SheetPanelData): Promise<ComponentFixture<SheetPanel>> {
  TestBed.configureTestingModule({
    imports: [SheetPanel],
    providers: [
      { provide: AdminOrdersService, useValue: new FakeOrders() },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, () => undefined) },
    ],
  });
  const fixture: ComponentFixture<SheetPanel> = TestBed.createComponent(SheetPanel);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<SheetPanel>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

const data = (over: Partial<SheetPanelData> = {}): SheetPanelData => ({
  order: order(),
  pickupLabel: 'Le Labo',
  customerLabel: 'Boulangerie Marin',
  window: { start: '06:00', end: '08:00', source: 'override' },
  ...over,
});

describe('SheetPanel', () => {
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
    const fixture = await render({ ...data(), window: null });

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
