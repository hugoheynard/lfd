import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { HandoverQueueEntryView, HandoverQueueView } from '@lfd/contracts';

import { AdminOrdersService } from '../../commandes/orders.service';
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
 * - **les onglets portent leur compteur** et sont dérivés des points reçus ;
 * - 🔴 **le rail de droite est là même sans sélection**, et se remplit au clic.
 *
 * On passe par le DOM : les membres sont `protected`, et c'est le gabarit qui
 * câble les branches — ce que le typecheck ne lit pas.
 *
 * ⚠️ **Le LIBELLÉ du retard n'est pas éprouvé ici**, et c'est délibéré : la page
 * juge contre l'horloge réelle, donc un cas qui fabriquerait une tranche échue
 * devrait dériver son heure de `Date.now()` — et se casserait au passage de
 * minuit, exactement la bombe à retardement que le dépôt interdit dans une
 * fixture. Les minutes et leur formulation sont éprouvées sur `lateMinutes` et
 * `lateLabel`, où l'instant est un PARAMÈTRE. Ici on tient la règle inverse,
 * celle qui coûte cher si elle lâche : sur un créneau `default`, aucun retard,
 * jamais.
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

/**
 * Le contenu du tiroir de la PREMIÈRE ligne, après l'avoir ouvert.
 *
 * ⚠️ La `.folddt-detail-row` existe toujours dans le DOM ; son contenu, non —
 * il n'est rendu qu'à l'ouverture. Lire la rangée fermée rendait une chaîne
 * vide, ce qui se lit comme « le tiroir ne dit rien » alors qu'il n'est pas
 * encore ouvert.
 */
async function openedDrawer(fixture: ComponentFixture<RemisesPage>): Promise<string> {
  const host = fixture.nativeElement as HTMLElement;
  const toggle = host.querySelector('tbody tr.folddt-row button[aria-expanded]');
  (toggle as HTMLElement | null)?.click();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return host.querySelector('tbody tr.folddt-detail-row')?.textContent ?? '';
}

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
    // Une heure d'ouverture recopiée à la commande : l'écran ne doit pas
    // allumer une alarme que personne n'a promise. Le backfill du 2026-08-15 en
    // a posé une sur l'intégralité des commandes antérieures — la règle qui
    // saute allume le portefeuille entier d'un coup, un matin.
    api.entries = [entry({ window: { start: '00:00', end: '00:01', source: 'default' } })];

    const fixture = await render(api);

    expect(text(fixture)).not.toContain('de retard');
    expect(text(fixture)).toContain('Attendue');
  });

  it('🔴 la colonne ÉTAT ne porte QUE l’état — le retard vit sous la ligne', async () => {
    // Régression : le retard était écrit deux fois sur la même ligne — une
    // pastille ambre dans cette colonne, et la même minute dans le tiroir deux
    // lignes plus bas. Deux tons pour un fait fait chercher la différence.
    //
    // Le cas ne peut pas fabriquer un retard (la page juge contre l'horloge
    // réelle, cf. l'en-tête) : il tient la forme de la cellule, qui est ce qui
    // a dérivé.
    const fixture = await render(new FakeQueue());
    const cells = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr.folddt-row td'),
    ];
    const state = cells.find((cell) => (cell.textContent ?? '').includes('Attendue'));

    expect((state?.textContent ?? '').trim()).toBe('Attendue');
  });

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

  it('🔴 une remise porte son heure sous le nom, à la place du numéro', async () => {
    const api = new FakeQueue();
    api.entries = [
      entry({
        state: 'handed_over',
        handedOverAt: `${DAY}T04:41:00.000Z`,
        handedOverVia: 'manual',
      }),
    ];

    const fixture = await render(api);
    const row = rowTexts(fixture)[0] ?? '';

    expect(row).toContain('remise');
    expect(row).not.toContain('CMD-1042');
    expect(row).toContain('Remise');
  });

  it('🔴 le tiroir d’une ligne ordinaire n’est JAMAIS vide', async () => {
    // Un chevron qui n'ouvre rien est une porte peinte sur un mur. Le tiroir
    // d'une ligne sans retard dit ce que la table ne montre pas : son point de
    // retrait, invisible dans l'onglet « tous les points ».
    const api = new FakeQueue();
    api.entries = [entry({ pickupLabel: 'Val Thorens' })];

    const fixture = await render(api);

    expect(await openedDrawer(fixture)).toContain('Val Thorens');
  });

  it('🔴 une remise rappelle son heure et SA NATURE dans le tiroir', async () => {
    // « saisie sans code » et non « scannée » : c'est ce qu'on relit quand
    // quelqu'un conteste, et les deux n'ont pas la même force.
    const api = new FakeQueue();
    api.entries = [
      entry({
        state: 'handed_over',
        handedOverAt: `${DAY}T04:41:00.000Z`,
        handedOverVia: 'manual',
      }),
    ];

    const fixture = await render(api);

    expect(await openedDrawer(fixture)).toContain('saisie sans code');
  });

  it('un sac encore à tendre propose le SCAN, pas une remise à l’aveugle', async () => {
    const fixture = await render(new FakeQueue());
    const row = (fixture.nativeElement as HTMLElement).querySelector('tbody tr.folddt-row');

    expect(row?.textContent ?? '').toContain('Scanner');
  });

  it('🔴 une commande déjà remise n’offre plus aucun geste', async () => {
    const api = new FakeQueue();
    api.entries = [entry({ state: 'handed_over', handedOverAt: `${DAY}T04:41:00.000Z` })];

    const fixture = await render(api);
    const row = (fixture.nativeElement as HTMLElement).querySelector('tbody tr.folddt-row');

    expect(row?.textContent ?? '').not.toContain('Scanner');
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
