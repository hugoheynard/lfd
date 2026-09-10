import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { HandoverQueueEntryView, HandoverQueueView } from '@lfd/contracts';

import { HandoverQueueService } from '../handover-queue.service';
import { RemisesPage } from './remises-page';

/**
 * Ce que ces cas tiennent, et que ni `tsc` ni le build AOT ne peuvent dire :
 *
 * - **chaque colonne rend quelque chose.** `fold-data-table` n'a aucun rendu par
 *   défaut : une colonne sans `foldCell` rend une cellule VIDE sans que rien ne
 *   rougisse. Les cas lisent donc le texte réellement produit ;
 * - 🔴 **une commande sans créneau reste à l'écran** et ne se voit pas prêter
 *   d'heure — c'est le cas de masse depuis le backfill du 2026-08-15 ;
 * - 🔴 **une commande annulée reste dans la file** : la masquer laisserait
 *   quelqu'un chercher une commande disparue ;
 * - **les onglets portent leur compteur** et sont dérivés des points reçus.
 *
 * On passe par le DOM : les membres sont `protected`, et c'est le gabarit qui
 * câble les branches — ce que le typecheck ne lit pas.
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

class FakeQueue {
  entries: readonly HandoverQueueEntryView[] = [entry()];
  fails = false;

  forDay(day: string): Promise<HandoverQueueView> {
    if (this.fails) {
      return Promise.reject(new Error('injoignable'));
    }
    return Promise.resolve({ day, entries: this.entries });
  }
}

async function render(api: FakeQueue): Promise<ComponentFixture<RemisesPage>> {
  TestBed.configureTestingModule({
    imports: [RemisesPage],
    providers: [{ provide: HandoverQueueService, useValue: api }],
  });
  const fixture: ComponentFixture<RemisesPage> = TestBed.createComponent(RemisesPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<RemisesPage>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

const rowTexts = (fixture: ComponentFixture<RemisesPage>): readonly string[] =>
  [...(fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr')].map(
    (row) => row.textContent ?? '',
  );

describe('RemisesPage', () => {
  it('rend chaque colonne de la ligne', async () => {
    const fixture = await render(new FakeQueue());
    const body = text(fixture);

    expect(body).toContain('Boulangerie Marin');
    expect(body).toContain('CMD-1042');
    expect(body).toContain('12');
    expect(body).toContain('Attendue');
    expect(body).toContain('6\u00a0h\u00a000 – 8\u00a0h\u00a000');
  });

  it('🔴 une commande sans créneau reste à l’écran et le DIT', async () => {
    const api = new FakeQueue();
    api.entries = [entry({ window: null })];

    const fixture = await render(api);

    expect(text(fixture)).toContain('Sans créneau');
    expect(text(fixture)).toContain('Boulangerie Marin');
  });

  it('🔴 ne parle pas de retard sur un créneau `default`, même largement dépassé', async () => {
    const api = new FakeQueue();
    // Une heure d'ouverture recopiée à la commande, un jour depuis longtemps
    // passé : l'écran ne doit pas allumer une alarme que personne n'a promise.
    api.entries = [entry({ window: { start: '06:00', end: '08:00', source: 'default' } })];

    const fixture = await render(api);

    expect(text(fixture)).not.toContain('En retard');
  });

  it('🔴 une commande annulée reste dans la file', async () => {
    const api = new FakeQueue();
    api.entries = [entry({ state: 'cancelled' })];

    const fixture = await render(api);

    expect(rowTexts(fixture)).toHaveLength(1);
    expect(text(fixture)).toContain('Annulée');
  });

  it('ordonne la file par créneau, la ligne sans créneau en dernier', async () => {
    const api = new FakeQueue();
    api.entries = [
      entry({ orderId: 'c', reference: 'CMD-C', window: null }),
      entry({
        orderId: 'b',
        reference: 'CMD-B',
        window: { start: '09:00', end: '10:00', source: 'override' },
      }),
      entry({
        orderId: 'a',
        reference: 'CMD-A',
        window: { start: '06:00', end: '07:00', source: 'override' },
      }),
    ];

    const fixture = await render(api);
    const rows = rowTexts(fixture);

    expect(rows[0]).toContain('CMD-A');
    expect(rows[1]).toContain('CMD-B');
    expect(rows[2]).toContain('CMD-C');
  });

  it('dérive un onglet par point de retrait, avec son compteur', async () => {
    const api = new FakeQueue();
    api.entries = [
      entry({ orderId: 'a', pickupLabel: 'Laboratoire' }),
      entry({ orderId: 'b', pickupLabel: 'Val Thorens' }),
      entry({ orderId: 'c', pickupLabel: 'Val Thorens' }),
    ];

    const fixture = await render(api);
    const tabs = [...(fixture.nativeElement as HTMLElement).querySelectorAll('[role="tab"]')].map(
      (tab) => tab.textContent ?? '',
    );

    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toContain('Tous les points');
    expect(tabs[0]).toContain('3');
    expect(tabs[2]).toContain('Val Thorens');
    expect(tabs[2]).toContain('2');
  });

  it('un jour sans personne le dit, sans table vide', async () => {
    const api = new FakeQueue();
    api.entries = [];

    const fixture = await render(api);

    expect(text(fixture)).toContain("Personne n'attend ce jour-là");
    expect(rowTexts(fixture)).toHaveLength(0);
  });

  it('une file illisible s’annonce et se réessaie', async () => {
    const api = new FakeQueue();
    api.fails = true;

    const fixture = await render(api);

    expect(text(fixture)).toContain('File illisible');
    expect(text(fixture)).toContain('Réessayer');
  });
});
