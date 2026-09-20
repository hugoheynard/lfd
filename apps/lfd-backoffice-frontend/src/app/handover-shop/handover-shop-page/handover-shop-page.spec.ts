import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import type { HandoverQueueEntryView, HandoverQueueView } from '@lfd/contracts';

import { AdminOrdersService } from '../../commandes/orders.service';
import { HandoverQueueService } from '../handover-queue.service';
import { HandoverShopPage } from './handover-shop-page';

/**
 * Ce que ces cas tiennent — **l'ÉCRAN, pas la file**.
 *
 * Le dessin des lignes est parti dans `app-queue-table` avec ses propres cas :
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
    clientele: 'pro',
    ...over,
  };
}

class FakeQueue {
  entries: readonly HandoverQueueEntryView[] = [entry()];
  fails = false;
  /** Les jours demandés, dans l'ordre — c'est par eux qu'on voit une bascule. */
  readonly days: string[] = [];

  forDay(day: string): Promise<HandoverQueueView> {
    this.days.push(day);
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

/**
 * Rend l'écran en faisant croire à une fenêtre ÉTROITE.
 *
 * ⚠️ Le doublé est posé avant `createComponent` et retiré juste après : la page
 * interroge `matchMedia` à sa construction, une seule fois, et le laisser en
 * place déborderait sur les cas suivants.
 */
async function renderNarrow(api: FakeQueue): Promise<ComponentFixture<HandoverShopPage>> {
  const original = window.matchMedia;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: () => ({
      matches: true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
  try {
    return await render(api);
  } finally {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: original,
    });
  }
}

async function render(api: FakeQueue): Promise<ComponentFixture<HandoverShopPage>> {
  TestBed.configureTestingModule({
    imports: [HandoverShopPage],
    providers: [
      { provide: HandoverQueueService, useValue: api },
      { provide: AdminOrdersService, useValue: new FakeOrders() },
    ],
  });
  const fixture: ComponentFixture<HandoverShopPage> = TestBed.createComponent(HandoverShopPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<HandoverShopPage>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

/**
 * Les lignes de la FILE, tiroirs exclus.
 *
 * ⚠️ `tbody tr` seul ne suffit plus : depuis que le retard s'annonce sous sa
 * ligne, `fold-data-table` intercale une `.folddt-detail-row` entre deux
 * lignes. Les compter ferait passer un tri pour cassé alors qu'il est juste —
 * c'est ce qui est arrivé en écrivant ce fichier.
 */
const rowTexts = (fixture: ComponentFixture<HandoverShopPage>): readonly string[] =>
  [...(fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr.folddt-row')].map(
    (row) => row.textContent ?? '',
  );

describe('HandoverShopPage', () => {
  it('la bande annonce les retraits faits, au singulier comme au pluriel', async () => {
    const api = new FakeQueue();
    api.entries = [
      entry({ orderId: 'a', state: 'handed_over', handedOverAt: `${DAY}T06:41:00.000Z` }),
      entry({ orderId: 'b' }),
    ];

    const fixture = await render(api);

    expect(text(fixture)).toContain('1 retrait');
    expect(text(fixture)).not.toContain('1 retraits');
    expect(text(fixture)).toContain('1 en attente');
  });

  it('🔴 les trois nombres portent sur le POINT OUVERT, pas sur la journée', async () => {
    // Ils portaient sur la journée entière, et c'était la vue d'un gérant :
    // qui lit cet écran est DANS un point, et « 2 en attente » dont un ailleurs
    // le fait chercher un sac qui n'est pas chez lui.
    const api = new FakeQueue();
    api.entries = [
      entry({ orderId: 'a', pickupLabel: 'Laboratoire' }),
      entry({ orderId: 'b', pickupLabel: 'Val Thorens' }),
      entry({ orderId: 'c', pickupLabel: 'Val Thorens' }),
    ];

    const fixture = await render(api);
    const el = fixture.nativeElement as HTMLElement;

    // Premier onglet ouvert : Laboratoire, une seule ligne.
    expect(el.querySelector('.mc-waiting')?.textContent).toContain('1 en attente');

    const tabs = [...el.querySelectorAll<HTMLElement>('[role="tab"]')];
    tabs.find((tab) => (tab.textContent ?? '').includes('Val Thorens'))?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('.mc-waiting')?.textContent).toContain('2 en attente');
  });

  it('🔴 chercher un nom ne fait pas tomber les compteurs', async () => {
    // Sans quoi un comptoir qui filtre lirait que ses retards sont réglés. Les
    // compteurs suivent l'ONGLET ; la recherche vit sous eux, dans la file.
    const api = new FakeQueue();
    api.entries = [
      entry({ orderId: 'a', customerLabel: 'Boulangerie Marin' }),
      entry({ orderId: 'b', customerLabel: 'Hôtel des Cimes' }),
    ];

    const fixture = await render(api);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.mc-waiting')?.textContent).toContain('2 en attente');

    const box = el.querySelector<HTMLInputElement>('.file-search input');
    if (box !== null) {
      box.value = 'marin';
      box.dispatchEvent(new Event('input', { bubbles: true }));
    }
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(rowTexts(fixture)).toHaveLength(1);
    expect(el.querySelector('.mc-waiting')?.textContent).toContain('2 en attente');
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

  it('🔴 sur écran étroit, choisir une ligne fait MONTER le sac sur la file', async () => {
    const api = new FakeQueue();
    api.entries = [entry({ orderId: 'a' })];
    const fixture = await renderNarrow(api);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.board')?.classList.contains('is-stacked')).toBe(true);
    expect(el.querySelector('.board')?.classList.contains('has-selection')).toBe(false);

    el.querySelector<HTMLElement>('tr.folddt-row')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('.board')?.classList.contains('has-selection')).toBe(true);
    // 🔴 La feuille RECOUVRE la file : un clavier qui continuerait de la
    // parcourir derrière tabulerait dans le vide.
    expect(el.querySelector<HTMLElement>('.board-queue')?.inert).toBe(true);
  });

  it('sur écran large, la file reste atteignable pendant la lecture du sac', async () => {
    const api = new FakeQueue();
    api.entries = [entry({ orderId: 'a' })];
    const fixture = await render(api);
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector<HTMLElement>('tr.folddt-row')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('.board')?.classList.contains('is-stacked')).toBe(false);
    expect(el.querySelector<HTMLElement>('.board-queue')?.inert).toBe(false);
  });

  it('🔴 à minuit, la file bascule sur le nouveau jour de service', async () => {
    // Régression de conception : le battement ne touchait que l'HEURE. Un poste
    // laissé ouvert la nuit gardait la file de la veille — et depuis que le
    // sélecteur de date a disparu, plus rien ne permettait d'en sortir sans
    // recharger. L'écran montrait au petit matin une file vide et des retards
    // de douze heures.
    // 🔴 Seulement `setInterval` et `Date`. Tout figer prendrait aussi les
    // `setTimeout` dont `whenStable` dépend, et le rendu n'aboutirait jamais —
    // le cas mourait alors sur un délai d'attente, pas sur ce qu'il éprouve.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    try {
      const api = new FakeQueue();
      api.entries = [entry({ orderId: 'a' })];
      const fixture = await render(api);
      const asked = api.days.length;

      // Assez pour franchir plusieurs battements ET un changement de date.
      vi.setSystemTime(new Date(Date.now() + 26 * 60 * 60 * 1000));
      vi.advanceTimersByTime(31_000);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(api.days.length).toBeGreaterThan(asked);
      expect(api.days.at(-1)).not.toBe(api.days[0]);
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * **La navigation par jour**, rendue à l'écran le 2026-09-17 (Hugo).
 *
 * Elle avait été retirée le 2026-09-11 pour une raison qui reste vraie — « le
 * seul geste qui peut faire tendre un sac en croyant être un autre jour ». Ce
 * qui la rend acceptable n'est donc pas le déplacement lui-même, c'est que
 * l'écran DISE où l'on est : ces cas tiennent l'avertissement autant que les
 * flèches.
 */
describe('HandoverShopPage — changer de journée', () => {
  const step = (fixture: ComponentFixture<HandoverShopPage>, label: string): HTMLButtonElement => {
    const found = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      `button[aria-label="${label}"]`,
    );
    if (found === null) {
      throw new Error(`Pas de bouton « ${label} ».`);
    }
    return found;
  };

  const press = async (
    fixture: ComponentFixture<HandoverShopPage>,
    button: HTMLButtonElement,
  ): Promise<void> => {
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('demande la veille au serveur, et le dit à l’écran', async () => {
    const api = new FakeQueue();
    const fixture = await render(api);
    const first = api.days[0];

    await press(fixture, step(fixture, 'Journée précédente'));

    expect(api.days.at(-1)).not.toBe(first);
    expect(text(fixture)).toContain('Vous consultez une autre journée');
  });

  it('🔴 ne CRIE pas sur la journée en cours — un avertissement permanent cesse d’être lu', async () => {
    const fixture = await render(new FakeQueue());

    expect(text(fixture)).not.toContain('Vous consultez une autre journée');
    expect((fixture.nativeElement as HTMLElement).querySelector('.day-today')).toBeNull();
  });

  it('revient à aujourd’hui, et le retour disparaît avec l’avertissement', async () => {
    const api = new FakeQueue();
    const fixture = await render(api);

    await press(fixture, step(fixture, 'Journée précédente'));
    const back = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.day-today',
    );
    expect(back).not.toBeNull();

    back?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture)).not.toContain('Vous consultez une autre journée');
  });

  /**
   * 🔴 **Le cas qui justifie `followingClock`.** L'horloge de comptoir remet la
   * file sur le jour courant toutes les trente secondes. Sans distinguer « je
   * suis l'horloge » de « je consulte une autre journée », quelqu'un venu relire
   * la veille pour une contestation se ferait ramener à aujourd'hui en une
   * demi-minute — l'écran sauterait sous ses doigts, sans rien expliquer.
   */
  it('🔴 la bascule de minuit n’ANNULE PAS une journée choisie à la main', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    try {
      const api = new FakeQueue();
      const fixture = await render(api);

      await press(fixture, step(fixture, 'Journée précédente'));
      const chosen = api.days.at(-1);

      // Le même saut que le cas de minuit ci-dessus : plusieurs battements ET
      // un changement de date.
      vi.setSystemTime(new Date(Date.now() + 26 * 60 * 60 * 1000));
      vi.advanceTimersByTime(31_000);
      await fixture.whenStable();
      fixture.detectChanges();

      // Aucune relecture n'a été demandée, et l'écran est resté où on l'avait mis.
      expect(api.days.at(-1)).toBe(chosen);
      expect(text(fixture)).toContain('Vous consultez une autre journée');
    } finally {
      vi.useRealTimers();
    }
  });
});
