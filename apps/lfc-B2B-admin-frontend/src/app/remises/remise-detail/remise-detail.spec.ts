import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { HandoverQueueEntryView, OrderHandoverView, OrderLineView } from '@lfd/contracts';

import { AdminOrdersService } from '../../commandes/orders.service';
import { HandoverQueueService } from '../handover-queue.service';
import { RemiseDetail } from './remise-detail';

/**
 * Ce que ces cas tiennent :
 *
 * - **le rail montre ce qu'il y a dans le sac** — il charge la commande à la
 *   sélection, parce que la file ne porte aucune ligne de marchandise ;
 * - 🔴 **sans sélection il reste là**, et le dit — c'est tout l'objet du rail
 *   permanent : la file ne se réorganise pas sous les doigts au premier clic ;
 * - 🔴 **changer de ligne ne garde pas les articles de la précédente** — la
 *   façon la plus simple de tendre le mauvais sac ;
 * - **une lecture ratée n'emporte pas le bon de commande** : il reste
 *   téléchargeable, et le rail le dit ;
 * - 🔴 **une annulation est annoncée**, pour qu'on puisse l'expliquer à qui se
 *   présente, et le geste de remise disparaît ;
 * - 🔴 **aucune heure n'est inventée** quand aucune tranche n'a été demandée ;
 * - 🔴 **la remise saisie dit qu'elle est saisie** — « sans code », parce
 *   qu'une attestation faible et honnête vaut mieux qu'une forte et fausse.
 */

const DAY = '2026-09-10';

function entry(over: Partial<HandoverQueueEntryView> = {}): HandoverQueueEntryView {
  return {
    orderId: 'ord_1',
    reference: 'CMD-1042',
    customerLabel: 'Boulangerie Marin',
    pickupLabel: 'Laboratoire',
    fulfillmentMethod: 'pickup',
    window: { start: '06:00', end: '08:00', source: 'default' },
    totalUnits: 12,
    placedAt: `${DAY}T05:00:00.000Z`,
    state: 'expected',
    handedOverAt: null,
    handedOverVia: null,
    readyAt: null,
    ...over,
  };
}

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

class FakeOrders {
  lines: readonly OrderLineView[] = [line()];
  fails = false;
  readonly downloaded: string[] = [];

  /**
   * Seules les LIGNES sont lues par le rail. Le doublé rend donc ce qu'il rend
   * vraiment, et n'annonce pas une `OrderView` : un `as unknown as` ici
   * laisserait le doublé dériver de la vraie signature sans que rien ne
   * rougisse — et la porte `no-type-escapes` le refuse pour cette raison.
   */
  byId(id: string): Promise<{ readonly id: string; readonly lines: readonly OrderLineView[] }> {
    if (this.fails) {
      return Promise.reject(new Error('injoignable'));
    }
    return Promise.resolve({ id, lines: this.lines });
  }

  sheetPdf(id: string): Promise<Blob> {
    this.downloaded.push(id);
    return Promise.resolve(new Blob(['%PDF-1.7'], { type: 'application/pdf' }));
  }
}

/** Le seul verbe que le rail appelle : la remise SAISIE, par le numéro. */
class FakeHandovers {
  readonly remitted: string[] = [];

  confirmManually(reference: string): Promise<Pick<OrderHandoverView, 'orderNumber'>> {
    this.remitted.push(reference);
    return Promise.resolve({ orderNumber: reference });
  }
}

interface Doubles {
  readonly orders: FakeOrders;
  readonly handovers: FakeHandovers;
}

async function render(
  selected: HandoverQueueEntryView | null,
  doubles: Doubles = { orders: new FakeOrders(), handovers: new FakeHandovers() },
): Promise<ComponentFixture<RemiseDetail>> {
  TestBed.configureTestingModule({
    imports: [RemiseDetail],
    providers: [
      { provide: AdminOrdersService, useValue: doubles.orders },
      { provide: HandoverQueueService, useValue: doubles.handovers },
    ],
  });
  const fixture: ComponentFixture<RemiseDetail> = TestBed.createComponent(RemiseDetail);
  fixture.componentRef.setInput('entry', selected);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<RemiseDetail>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

const buttonSaying = (fixture: ComponentFixture<RemiseDetail>, label: string): HTMLElement | null =>
  [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((button) =>
    (button.textContent ?? '').includes(label),
  ) ?? null;

describe('RemiseDetail', () => {
  it('montre ce qu’il y a dans le sac', async () => {
    const fixture = await render(entry());

    expect(text(fixture)).toContain('Croissant nature');
    expect(text(fixture)).toContain('CROI-NAT');
    expect(text(fixture)).toContain('Boulangerie Marin');
    expect(text(fixture)).toContain('CMD-1042');
  });

  it('🔴 sans sélection, le rail est là et le dit', async () => {
    const fixture = await render(null);

    expect(text(fixture)).toContain('Aucune commande choisie');
    // Et surtout : rien d'un sac précédent.
    expect(text(fixture)).not.toContain('Croissant nature');
  });

  it('🔴 changer de ligne n’emporte pas les articles de la précédente', async () => {
    const orders = new FakeOrders();
    const fixture = await render(entry(), { orders, handovers: new FakeHandovers() });
    expect(text(fixture)).toContain('Croissant nature');

    orders.lines = [line({ sku: 'PAIN-COMP', productName: 'Pain complet' })];
    fixture.componentRef.setInput('entry', entry({ orderId: 'ord_2', reference: 'CMD-1043' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture)).toContain('Pain complet');
    expect(text(fixture)).not.toContain('Croissant nature');
  });

  it('🔴 sans tranche demandée, ne montre AUCUNE heure', async () => {
    const fixture = await render(entry({ window: null }));

    expect(text(fixture)).toContain('aucune tranche demandée');
    expect(text(fixture)).not.toContain('h\u00a000');
  });

  it('🔴 une annulation est annoncée, et rien ne peut être remis', async () => {
    const fixture = await render(entry({ state: 'cancelled' }));

    expect(text(fixture)).toContain('Cette commande est annulée');
    expect(buttonSaying(fixture, 'Remettre')).toBeNull();
  });

  it('🔴 une commande déjà remise ne se remet pas une seconde fois', async () => {
    const fixture = await render(
      entry({ state: 'handed_over', handedOverAt: `${DAY}T06:41:00.000Z`, handedOverVia: 'scan' }),
    );

    expect(text(fixture)).toContain('Le sac est parti');
    expect(buttonSaying(fixture, 'Remettre')).toBeNull();
  });

  it('🔴 la remise saisie dit qu’elle est SANS CODE, et part sur le numéro', async () => {
    const handovers = new FakeHandovers();
    const fixture = await render(entry(), { orders: new FakeOrders(), handovers });

    const remit = buttonSaying(fixture, 'Remettre sans code');
    expect(remit).not.toBeNull();
    remit?.click();
    await fixture.whenStable();

    expect(handovers.remitted).toEqual(['CMD-1042']);
  });

  it('une lecture ratée le dit et laisse le bon accessible', async () => {
    const orders = new FakeOrders();
    orders.fails = true;

    const fixture = await render(entry(), { orders, handovers: new FakeHandovers() });

    expect(text(fixture)).toContain('Contenu illisible');
    expect(buttonSaying(fixture, 'Voir le bon')).not.toBeNull();
  });

  it('le bon de commande se demande sur l’identifiant de la ligne', async () => {
    const orders = new FakeOrders();
    // jsdom n'implémente pas les URL d'objet : on les pose le temps du cas,
    // plutôt que d'espionner une propriété qui n'existe pas.
    const previousCreate = URL.createObjectURL;
    const previousRevoke = URL.revokeObjectURL;
    URL.createObjectURL = () => 'blob:remise';
    URL.revokeObjectURL = () => undefined;

    try {
      const fixture = await render(entry(), { orders, handovers: new FakeHandovers() });
      buttonSaying(fixture, 'Voir le bon')?.click();
      await fixture.whenStable();

      expect(orders.downloaded).toEqual(['ord_1']);
    } finally {
      URL.createObjectURL = previousCreate;
      URL.revokeObjectURL = previousRevoke;
    }
  });
});
