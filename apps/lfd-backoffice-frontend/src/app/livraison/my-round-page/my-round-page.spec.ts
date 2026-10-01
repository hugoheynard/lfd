import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  MyDeliveryRoundSummaryView,
  MyDeliveryRoundView,
  MyDeliveryRoundsView,
} from '@lfd/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MyDeliveryRoundService } from '../my-delivery-round.service';
import { myRoundOf, myStopOf } from '../my-round.fixture';
import { NAVIGATION_APP_KEY } from '../my-round-navigation';
import { parisDayOf } from '../run-sheet';
import { MyRoundPage } from './my-round-page';

function summaryOf(id: string): MyDeliveryRoundSummaryView {
  return { id, vehicleName: 'Kangoo', passage: 1, departedAt: null, stopCount: 2 };
}

interface Wire {
  rounds: readonly MyDeliveryRoundSummaryView[];
  round: MyDeliveryRoundView;
  /** Ce que rend la tournée APRÈS un départ réussi. */
  afterDepart: MyDeliveryRoundView | null;
  refuse: HttpErrorResponse | null;
  readonly calls: string[];
}

let wire: Wire;

async function settle(fixture: ComponentFixture<MyRoundPage>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

async function boot(
  partial: Partial<Wire> = {},
): Promise<{ fixture: ComponentFixture<MyRoundPage>; element: HTMLElement }> {
  wire = {
    rounds: [summaryOf('r-1')],
    round: myRoundOf(),
    afterDepart: null,
    refuse: null,
    calls: [],
    ...partial,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: MyDeliveryRoundService,
        useValue: {
          mine: (date: string): Promise<MyDeliveryRoundsView> => {
            wire.calls.push(`mine ${date}`);
            return Promise.resolve({ date, rounds: wire.rounds });
          },
          round: (id: string): Promise<MyDeliveryRoundView> => {
            wire.calls.push(`round ${id}`);
            return Promise.resolve({ ...wire.round, id });
          },
          depart: (id: string, payload: unknown): Promise<void> => {
            wire.calls.push(`depart ${id} ${JSON.stringify(payload)}`);
            if (wire.refuse !== null) {
              return Promise.reject(wire.refuse);
            }
            if (wire.afterDepart !== null) {
              wire.round = wire.afterDepart;
            }
            return Promise.resolve();
          },
          stepPhoto: (): Promise<Blob> => Promise.resolve(new Blob(['x'])),
        } satisfies Partial<Record<keyof MyDeliveryRoundService, unknown>>,
      },
    ],
  });
  const fixture = TestBed.createComponent(MyRoundPage);
  fixture.detectChanges();
  await settle(fixture);
  await settle(fixture);
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

function click(element: Element, selector: string): void {
  const found = element.querySelector<HTMLElement>(selector);
  if (found === null) {
    throw new Error(`introuvable : ${selector}`);
  }
  found.click();
}

beforeEach(() => {
  localStorage.removeItem(NAVIGATION_APP_KEY);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MyRoundPage — trouver sa tournée', () => {
  it('lit les tournées d’aujourd’hui, et ouvre directement la seule', async () => {
    const { element } = await boot();
    expect(wire.calls).toEqual([`mine ${parisDayOf(new Date())}`, 'round r-1']);
    expect(element.querySelectorAll('[data-my-stop]')).toHaveLength(2);
    // Une seule tournée : rien à quoi revenir.
    expect(element.querySelector('[data-back]')).toBeNull();
  });

  it('plusieurs : on choisit, puis on peut revenir au choix', async () => {
    const { fixture, element } = await boot({ rounds: [summaryOf('r-1'), summaryOf('r-2')] });
    expect(element.querySelectorAll('[data-my-round-choice]')).toHaveLength(2);
    expect(wire.calls).toEqual([`mine ${parisDayOf(new Date())}`]);

    const second = element.querySelectorAll<HTMLElement>('[data-open-my-round]')[1];
    second?.click();
    await settle(fixture);
    expect(wire.calls.at(-1)).toBe('round r-2');
    expect(element.querySelectorAll('[data-my-stop]')).toHaveLength(2);

    click(element, '[data-back]');
    await settle(fixture);
    expect(element.querySelectorAll('[data-my-round-choice]')).toHaveLength(2);
  });

  it('aucune : le dit', async () => {
    const { element } = await boot({ rounds: [] });
    expect(element.querySelector('[data-no-round]')?.textContent).toContain(
      'Aucune tournée ne vous est affectée aujourd’hui',
    );
  });
});

describe('MyRoundPage — au dépôt', () => {
  it('« Commencer ma tournée » envoie la version lue, puis relit', async () => {
    const departed = myRoundOf({ departedAt: '2026-10-01T05:42:00.000Z', freeze: 'departure' });
    const { fixture, element } = await boot({ afterDepart: departed });
    // Au dépôt, pas encore de navigation.
    expect(element.querySelector('[data-go-to]')).toBeNull();
    expect(element.querySelector('[data-legs]')).toBeNull();

    click(element, '[data-depart]');
    await settle(fixture);
    expect(wire.calls.slice(-2)).toEqual(['depart r-1 {"version":3}', 'round r-1']);
    expect(element.querySelector('[data-depart]')).toBeNull();
    expect(element.querySelector('[data-departed]')?.textContent).toContain('Partie à 7 h 42');
  });

  it('affiche le refus du serveur tel quel, et relit la tournée', async () => {
    const message = '2 bacs ne sont pas chargés (Refuge 1950) — appelez le dépôt';
    const { fixture, element } = await boot({
      refuse: new HttpErrorResponse({ status: 409, error: { message } }),
    });

    click(element, '[data-depart]');
    await settle(fixture);
    expect(element.querySelector('[data-refusal]')?.textContent?.trim()).toBe(message);
    expect(wire.calls.at(-1)).toBe('round r-1');
    expect(element.querySelector('[data-depart]')).not.toBeNull();
  });
});

describe('MyRoundPage — partie', () => {
  const departedAt = '2026-10-01T05:42:00.000Z';

  it('« Toute la tournée » par tronçons, « Y aller » sur chaque arrêt restant', async () => {
    const stops = Array.from({ length: 7 }, (_, index) =>
      myStopOf({ rank: index + 1, gps: { lat: 45, lng: index + 1 } }),
    );
    const { element } = await boot({ round: myRoundOf({ departedAt, stops }) });

    const legs = [...element.querySelectorAll('[data-leg]')];
    expect(legs.map((leg) => leg.textContent?.replace(/\s+/gu, ' ').trim())).toEqual([
      'Tronçon 1 sur 2 · arrêts 1 à 4',
      'Tronçon 2 sur 2 · arrêts 5 à 7',
    ]);
    expect(legs[1]?.getAttribute('href')).toContain('origin=45,4');
    const goTo = element.querySelectorAll('[data-go-to]');
    expect(goTo).toHaveLength(7);
    expect(goTo[0]?.getAttribute('href')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=45,1&travelmode=driving',
    );
  });

  it('mémorise l’application choisie pour « Y aller »', async () => {
    localStorage.setItem(NAVIGATION_APP_KEY, 'waze');
    const { element } = await boot({ round: myRoundOf({ departedAt }) });
    expect(element.querySelector('[data-go-to]')?.getAttribute('href')).toMatch(
      /^https:\/\/waze\.com\/ul\?ll=/u,
    );
  });

  it('« Rentrer » quand il ne reste rien', async () => {
    const done = '2026-10-01T09:00:00.000Z';
    const { element } = await boot({
      round: myRoundOf({
        departedAt,
        stops: [myStopOf({ rank: 1, closedAt: done })],
        home: {
          pickupAddressId: 'p-1',
          label: 'Labo',
          address: {
            label: '',
            ligne1: '1 route du Fournil',
            ligne2: '',
            codePostal: '73320',
            ville: 'Tignes',
            pays: 'FR',
          },
          gps: { lat: 45.46, lng: 6.9 },
        },
      }),
    });
    expect(element.querySelector('[data-home]')?.getAttribute('href')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=45.46,6.9&travelmode=driving',
    );
    expect(element.querySelector('[data-legs]')).toBeNull();
    expect(element.querySelector('[data-my-stop]')).toBeNull();
  });

  it('dit quand ordre et position n’ont pas été figés au départ', async () => {
    const { element } = await boot({ round: myRoundOf({ departedAt, freeze: 'not_frozen' }) });
    expect(element.querySelector('[data-not-frozen]')).not.toBeNull();
  });

  it('montre la procédure, signature, froid et le lien d’appel', async () => {
    const stop = myStopOf({
      signatureRequired: true,
      bins: 3,
      coldBins: 1,
      contact: { prenom: 'Léa', nom: 'Roux', telephone: '06 12 34 56 78' },
      procedure: [
        {
          id: 'st-1',
          number: 1,
          title: 'Par la cour',
          body: '',
          hasPhoto: true,
          photoRevision: 'rev-1',
        },
      ],
    });
    URL.createObjectURL = vi.fn(() => 'blob:step');
    const { element } = await boot({ round: myRoundOf({ stops: [stop] }) });
    const card = element.querySelector('[data-my-stop]');
    expect(card?.querySelector('[data-signature]')).not.toBeNull();
    expect(card?.querySelector('[data-bins]')?.textContent).toContain('3 bacs, dont 1 froid');
    expect(card?.querySelector('[data-tel] a')?.getAttribute('href')).toBe('tel:0612345678');
    expect(card?.querySelector('[data-procedure]')?.textContent).toContain('Par la cour');
    expect(card?.querySelector('app-my-round-step-photo')).not.toBeNull();
  });
});
