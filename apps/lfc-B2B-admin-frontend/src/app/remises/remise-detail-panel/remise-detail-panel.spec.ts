import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import type { HandoverQueueEntryView, OrderLineView } from '@lfd/contracts';

import { AdminOrdersService } from '../../commandes/orders.service';
import { RemiseDetailPanel, type RemiseDetailData } from './remise-detail-panel';

/**
 * Ce que ces cas tiennent :
 *
 * - **le panneau montre ce qu'il y a dans le sac** — il charge la commande au
 *   clic, parce que la file ne porte aucune ligne de marchandise ;
 * - **une lecture ratée n'emporte pas le bon de commande** : il reste
 *   téléchargeable, et le panneau le dit ;
 * - 🔴 **une annulation est annoncée**, pour qu'on puisse l'expliquer à qui se
 *   présente ;
 * - 🔴 **aucune heure n'est inventée** quand aucune tranche n'a été demandée.
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
   * Seules les LIGNES sont lues par le panneau. Le doublé rend donc ce qu'il
   * rend vraiment, et n'annonce pas une `OrderView` : un `as unknown as` ici
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

async function render(
  api: FakeOrders,
  data: RemiseDetailData,
): Promise<ComponentFixture<RemiseDetailPanel>> {
  TestBed.configureTestingModule({
    imports: [RemiseDetailPanel],
    providers: [
      { provide: AdminOrdersService, useValue: api },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, () => undefined) },
    ],
  });
  const fixture: ComponentFixture<RemiseDetailPanel> = TestBed.createComponent(RemiseDetailPanel);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<RemiseDetailPanel>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

describe('RemiseDetailPanel', () => {
  it('montre ce qu’il y a dans le sac', async () => {
    const fixture = await render(new FakeOrders(), { entry: entry() });

    expect(text(fixture)).toContain('Croissant nature');
    expect(text(fixture)).toContain('CROI-NAT');
    expect(text(fixture)).toContain('Boulangerie Marin');
    expect(text(fixture)).toContain('CMD-1042');
  });

  it('🔴 sans tranche demandée, ne montre AUCUNE heure', async () => {
    const fixture = await render(new FakeOrders(), { entry: entry({ window: null }) });

    expect(text(fixture)).toContain('Aucune tranche demandée');
    expect(text(fixture)).not.toContain('h 00');
  });

  it('🔴 une annulation est annoncée, en clair', async () => {
    const fixture = await render(new FakeOrders(), { entry: entry({ state: 'cancelled' }) });

    expect(text(fixture)).toContain('Cette commande est annulée');
    expect(text(fixture)).toContain('Annulée');
  });

  it('une lecture ratée le dit et laisse le bon accessible', async () => {
    const api = new FakeOrders();
    api.fails = true;

    const fixture = await render(api, { entry: entry() });

    expect(text(fixture)).toContain('Contenu illisible');
    expect(text(fixture)).toContain('Bon de commande');
  });

  it('le bon de commande se demande sur l’identifiant de la ligne', async () => {
    const api = new FakeOrders();
    // jsdom n'implémente pas les URL d'objet : on les pose le temps du cas,
    // plutôt que d'espionner une propriété qui n'existe pas.
    const previousCreate = URL.createObjectURL;
    const previousRevoke = URL.revokeObjectURL;
    URL.createObjectURL = () => 'blob:remise';
    URL.revokeObjectURL = () => undefined;

    try {
      const fixture = await render(api, { entry: entry() });
      const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
      const download = buttons.find((button) =>
        (button.textContent ?? '').includes('Bon de commande'),
      );
      download?.click();
      await fixture.whenStable();

      expect(api.downloaded).toEqual(['ord_1']);
    } finally {
      URL.createObjectURL = previousCreate;
      URL.revokeObjectURL = previousRevoke;
    }
  });
});
