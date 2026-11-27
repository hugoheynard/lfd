import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { FulfillmentWindow, PlannerView, ShopItemView } from '@lfd/contracts';

import { plannerCopy } from '../../copy/screens/planner.copy';
import { OrderContextStore, type ServiceChoice } from '../../order-context.store';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { ClientPlanner } from '../client-planner.service';
import { PlannerBoard } from '../planner-board.store';
import { PlannerSlots } from '../planner-slots';
import { lineCheck, plannerView, PLANNER_DAY } from '../planner.fixture';
import { PlannerPage } from './planner-page';

const COPY = plannerCopy('fr');
const SLOT = { start: '07:00', end: '09:00' };
const ITEMS: Readonly<Record<string, Partial<ShopItemView>>> = {
  'VIE-001': { sku: 'VIE-001', name: 'Croissant' },
  'PAI-001': { sku: 'PAI-001', name: 'Baguette' },
};
const PICKUP: ServiceChoice = {
  mode: 'pickup',
  pickupAddressId: 'pt_labo',
  place: 'Le Labo',
  at: 'au Labo',
  address: '',
  slot: '7 h – 9 h',
  window: SLOT,
  date: PLANNER_DAY,
};

let fixture: ComponentFixture<PlannerPage>;
let reads: number;
const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

async function render(
  answer: () => Promise<PlannerView>,
  candidates: readonly FulfillmentWindow[] = [],
): Promise<void> {
  reads = 0;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [PlannerPage],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ClientPlanner,
        useValue: {
          read: () => {
            reads += 1;
            return answer();
          },
          quote: () => Promise.resolve(8420),
        },
      },
      {
        provide: ShopCatalogue,
        useValue: {
          itemOf: (sku: string) => ITEMS[sku] ?? null,
          hydrate: () => Promise.resolve(),
        },
      },
      { provide: OrderContextStore, useValue: { choice: signal(PICKUP) } },
    ],
  });
  TestBed.overrideComponent(PlannerPage, {
    set: {
      providers: [
        PlannerBoard,
        {
          provide: PlannerSlots,
          useValue: {
            candidates: signal(candidates),
            loadPickup: () => Promise.resolve(),
          },
        },
      ],
    },
  });
  fixture = TestBed.createComponent(PlannerPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('PlannerPage', () => {
  it('attend la grille par un chargement fold', async () => {
    await render(() => new Promise<PlannerView>(() => undefined));

    expect(el().querySelector('fold-loading')).not.toBeNull();
  });

  it('un échec de lecture se dit, et Réessayer relit', async () => {
    await render(() => Promise.reject(new Error('réseau')));

    expect(el().querySelector('[data-planner-failed]')).not.toBeNull();
    el().querySelector<HTMLButtonElement>('[data-planner-failed] button')?.click();
    expect(reads).toBe(2);
  });

  it('montre l’acheminement, les favoris à gauche et la case enregistrée', async () => {
    await render(() => Promise.resolve(plannerView()));

    expect(el().querySelector('[data-planner-site]')?.textContent).toContain(COPY.pickup);
    expect(el().querySelector('[data-planner-favorite="VIE-001"]')?.textContent).toContain(
      'Croissant',
    );
    expect(el().querySelector('[data-planner-line="VIE-001"]')).not.toBeNull();
    expect(el().querySelectorAll('app-planner-cell')).toHaveLength(1);
  });

  it('le bouton « Ajouter des articles » ouvre la boutique sur l’onglet Favoris', async () => {
    await render(() => Promise.resolve(plannerView()));

    const link = el().querySelector('[data-planner-add-items]');
    expect(link?.getAttribute('href')).toBe('/boutique?rayon=vitrine:favorites');
  });

  it('« ＋ » ajoute le jour suivant, une colonne de plus', async () => {
    await render(() => Promise.resolve(plannerView()));

    el().querySelector<HTMLButtonElement>('[data-planner-add-day]')?.click();
    fixture.detectChanges();

    expect(el().querySelectorAll('.day-head')).toHaveLength(2);
    expect(el().querySelectorAll('app-planner-cell')).toHaveLength(2);
  });

  it('pendant le glisser d’un favori, le jour où il ne passe pas est grisé avec la phrase', async () => {
    await render(() =>
      Promise.resolve(
        plannerView({
          checks: [
            lineCheck({
              sku: 'PAI-001',
              day: PLANNER_DAY,
              quantityIndependent: true,
              blocking: { cause: 'day_closed', reason: 'Pas de baguette le mardi.' },
            }),
          ],
        }),
      ),
    );

    // Au repos, le favori le dit déjà.
    expect(
      el().querySelector('[data-planner-favorite="PAI-001"] [data-planner-not-orderable]'),
    ).not.toBeNull();

    el()
      .querySelector('[data-planner-favorite="PAI-001"]')
      // Un glisser sans transfert : jsdom n'en fabrique pas, le navigateur si.
      ?.dispatchEvent(Object.assign(new Event('dragstart'), { dataTransfer: null }));
    fixture.detectChanges();

    expect(el().querySelector('[data-planner-drop-refusal]')?.textContent).toContain(
      'Pas de baguette le mardi.',
    );
  });

  it('« ＋ un créneau » ne s’ouvre que s’il reste un créneau du site sans rangée', async () => {
    await render(() => Promise.resolve(plannerView()), [SLOT]);
    const trigger = (): HTMLButtonElement | null =>
      el().querySelector<HTMLButtonElement>('[data-planner-add-slot]');

    expect(trigger()?.disabled).toBe(true);
    expect(el().textContent).toContain(COPY.noMoreSlots);

    await render(() => Promise.resolve(plannerView()), [SLOT, { start: '11:00', end: '12:00' }]);
    expect(trigger()?.disabled).toBe(false);
  });
});
