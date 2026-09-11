import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { HandoverQueueEntryView, HandoverQueueView } from '@lfd/contracts';

import { AdminOrdersService } from '../../commandes/orders.service';
import { HandoverQueueService } from '../handover-queue.service';
import { RemisesPage } from './remises-page';

/**
 * Ce que ces cas tiennent — **l'ÉCRAN, pas la file**.
 *
 * Le dessin des lignes est parti dans `app-file-remise` avec ses propres cas :
 * les colonnes, l'ordre, la note de retard, les gestes émis. Ce qui reste ici
 * est ce que la page seule décide :
 *
 * - **les onglets portent leur compteur** et sont dérivés des points reçus ;
 * - **la bande compte la journée entière**, pas l'onglet ouvert ;
 * - 🔴 **le rail de droite est là même sans sélection**, et se remplit au clic ;
 * - les trois états de la lecture — chargement, échec, journée vide.
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
    tradeName: null,
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

/**
 * Le rail de droite lit la commande choisie. Il vit dans CETTE page depuis
 * qu'il a cessé d'être un panneau modal : sans ce doublé, chaque cas partirait
 * chercher une commande par HTTP.
 */
class FakeOrders {
  byId(id: string): Promise<{ readonly id: string; readonly lines: readonly never[] }> {
    return Promise.resolve({ id, lines: [] });
  }
}

async function render(api: FakeQueue): Promise<ComponentFixture<RemisesPage>> {
  TestBed.configureTestingModule({
    imports: [RemisesPage],
    providers: [
      { provide: HandoverQueueService, useValue: api },
      { provide: AdminOrdersService, useValue: new FakeOrders() },
    ],
  });
  const fixture: ComponentFixture<RemisesPage> = TestBed.createComponent(RemisesPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<RemisesPage>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

/**
 * Les lignes de la FILE, tiroirs exclus.
 *
 * ⚠️ `tbody tr` seul ne suffit plus : depuis que le retard s'annonce sous sa
 * ligne, `fold-data-table` intercale une `.folddt-detail-row` entre deux
 * lignes. Les compter ferait passer un tri pour cassé alors qu'il est juste —
 * c'est ce qui est arrivé en écrivant ce fichier.
 */
const rowTexts = (fixture: ComponentFixture<RemisesPage>): readonly string[] =>
  [...(fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr.folddt-row')].map(
    (row) => row.textContent ?? '',
  );

describe('RemisesPage', () => {
  it('la bande annonce les remises faites, au singulier comme au pluriel', async () => {
    const api = new FakeQueue();
    api.entries = [
      entry({ orderId: 'a', state: 'handed_over', handedOverAt: `${DAY}T06:41:00.000Z` }),
      entry({ orderId: 'b' }),
    ];

    const fixture = await render(api);

    expect(text(fixture)).toContain('1 remise');
    expect(text(fixture)).not.toContain('1 remises');
    expect(text(fixture)).toContain('1 en attente');
  });

  it('🔴 le rail est là sans sélection, et se remplit au clic', async () => {
    const fixture = await render(new FakeQueue());

    expect(text(fixture)).toContain('Aucune commande choisie');

    const row = (fixture.nativeElement as HTMLElement).querySelector('tbody tr');
    (row as HTMLElement | null)?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture)).not.toContain('Aucune commande choisie');
    expect(text(fixture)).toContain('Boulangerie Marin');
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

    // 🔴 Un onglet par point, et rien au-dessus : le « Tous les points » est
    // parti le 2026-09-11. On ne tend pas un sac depuis deux comptoirs à la
    // fois, et la file des autres ne fait qu'allonger la sienne.
    expect(tabs).toHaveLength(2);
    expect(tabs.join(' ')).not.toContain('Tous les points');
    expect(tabs[0]).toContain('Laboratoire');
    expect(tabs[0]).toContain('1');
    expect(tabs[1]).toContain('Val Thorens');
    expect(tabs[1]).toContain('2');
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
