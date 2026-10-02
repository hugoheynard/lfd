import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  DeliveryIncidentView,
  DeliveryLoadingRoundView,
  MyDeliveryRoundSummaryView,
  MyDeliveryRoundView,
  MyDeliveryRoundsView,
  StaffPermission,
} from '@lfd/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { type DayWatch, DayVersionWatcher } from '../../shared/day-version/day-version-watcher';
import { MyDeliveryLoadingService } from '../my-delivery-loading.service';
import { type IncidentReport, MyDeliveryRoundService } from '../my-delivery-round.service';
import { myRoundOf, mySheetLineOf, myStopOf } from '../my-round.fixture';
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
  /** Ce que rend la tournée APRÈS un geste à la porte réussi. */
  afterGesture: MyDeliveryRoundView | null;
  granted: readonly StaffPermission[];
  readonly calls: string[];
}

let wire: Wire;
/** Ce que la page a confié au veilleur de version — pour jouer un changement. */
let watched: DayWatch | null;

function loadingViewOf(roundId: string): DeliveryLoadingRoundView {
  return {
    roundId,
    day: '2026-10-01',
    vehicleName: 'Kangoo',
    passage: 1,
    version: 3,
    departedAt: null,
    stops: [],
  };
}

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
    afterGesture: null,
    granted: ['delivery_driving:write', 'delivery_doorstep:write'],
    calls: [],
    ...partial,
  };
  const gesture = (call: string): Promise<void> => {
    wire.calls.push(call);
    if (wire.refuse !== null) {
      return Promise.reject(wire.refuse);
    }
    if (wire.afterGesture !== null) {
      wire.round = wire.afterGesture;
    }
    return Promise.resolve();
  };
  watched = null;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: DayVersionWatcher,
        useValue: {
          watch: (spec: DayWatch): void => {
            watched = spec;
          },
        },
      },
      {
        provide: MyDeliveryLoadingService,
        useValue: {
          round: (id: string): Promise<DeliveryLoadingRoundView> => {
            wire.calls.push(`loading ${id}`);
            return Promise.resolve(loadingViewOf(id));
          },
          plan: (): Promise<never> => Promise.reject(new Error('plan hors sujet ici')),
          load: (): Promise<void> => Promise.resolve(),
          unload: (): Promise<void> => Promise.resolve(),
        } satisfies Partial<Record<keyof MyDeliveryLoadingService, unknown>>,
      },
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
          arrive: (id: string, stopId: string): Promise<void> => gesture(`arrive ${id} ${stopId}`),
          closeWithoutHandover: (id: string, stopId: string, payload: unknown): Promise<void> =>
            gesture(`close ${id} ${stopId} ${JSON.stringify(payload)}`),
          returnToDepot: (id: string): Promise<void> => gesture(`return ${id}`),
          report: (id: string, report: IncidentReport): Promise<string> => {
            wire.calls.push(
              `report ${id} ${report.family} ${report.reason} ${String(report.stopId)}`,
            );
            return Promise.resolve('i-1');
          },
          incidentPhoto: (id: string, incidentId: string): Promise<Blob> => {
            wire.calls.push(`photo ${id} ${incidentId}`);
            return Promise.resolve(new Blob(['x']));
          },
        } satisfies Partial<Record<keyof MyDeliveryRoundService, unknown>>,
      },
      {
        provide: PermissionsStore,
        useValue: { can: (permission: StaffPermission) => wire.granted.includes(permission) },
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
    expect(card?.querySelector('[data-bins]')?.textContent).toContain(
      '3 bacs déclarés, dont 1 froid',
    );
    expect(card?.querySelector('[data-tel] a')?.getAttribute('href')).toBe('tel:0612345678');
    expect(card?.querySelector('[data-procedure]')?.textContent).toContain('Par la cour');
    expect(card?.querySelector('app-my-round-step-photo')).not.toBeNull();
  });
});

function incidentOf(overrides: Partial<DeliveryIncidentView> = {}): DeliveryIncidentView {
  return {
    id: 'i-1',
    roundId: 'r-1',
    stopId: null,
    orderReference: null,
    family: 'road',
    reason: 'traffic_jam',
    note: 'Bouchon au tunnel',
    hasPhoto: true,
    reportedAt: '2026-10-01T06:10:00.000Z',
    reportedBy: { staffUserId: 'u-1', name: 'Léa Martin' },
    ...overrides,
  };
}

describe('MyRoundPage — à la porte (lot A, PL2)', () => {
  const departedAt = '2026-10-01T05:42:00.000Z';

  it('au dépôt, aucun geste à la porte n’est offert', async () => {
    const { element } = await boot();
    expect(element.querySelector('[data-report-round]')).toBeNull();
    expect(element.querySelector('[data-return]')).toBeNull();
    expect(element.querySelector('[data-arrive]')).toBeNull();
    expect(element.querySelector('[data-report-stop]')).toBeNull();
  });

  it('partie, sans delivery_doorstep:write, aucun geste à la porte n’est offert', async () => {
    const { element } = await boot({
      round: myRoundOf({ departedAt }),
      granted: ['delivery_driving:write'],
    });
    expect(element.querySelector('[data-go-to]')).not.toBeNull();
    expect(element.querySelector('[data-report-round]')).toBeNull();
    expect(element.querySelector('[data-return]')).toBeNull();
    expect(element.querySelector('[data-arrive]')).toBeNull();
    expect(element.querySelector('[data-report-stop]')).toBeNull();
    expect(element.querySelector('[data-hand-over]')).toBeNull();
  });

  it('« Je suis arrivé » sur l’arrêt suivant seulement, puis relit et affiche l’heure', async () => {
    const arrived = myRoundOf({
      departedAt,
      stops: [myStopOf({ rank: 1, arrivedAt: '2026-10-01T06:05:00.000Z' }), myStopOf({ rank: 2 })],
    });
    const { fixture, element } = await boot({
      round: myRoundOf({ departedAt }),
      afterGesture: arrived,
    });
    const buttons = element.querySelectorAll('[data-arrive]');
    expect(buttons).toHaveLength(1);
    expect(
      element.querySelectorAll('[data-my-stop]')[0]?.querySelector('[data-arrive]'),
    ).not.toBeNull();

    click(element, '[data-arrive]');
    await settle(fixture);
    expect(wire.calls.slice(-2)).toEqual(['arrive r-1 s-1', 'round r-1']);
    expect(element.querySelector('[data-arrived]')?.textContent).toContain('Arrivé à 8 h 05');
    // Une fois : l'arrêt arrivé ne le propose plus.
    expect(element.querySelector('[data-arrive]')).toBeNull();
  });

  it('« Clore sans remise » n’existe que pour une commande retirée ou annulée, et envoie la version lue', async () => {
    const { fixture, element } = await boot({
      round: myRoundOf({
        departedAt,
        stops: [
          myStopOf({ rank: 1 }),
          myStopOf({ rank: 2, orderState: 'handed_over' }),
          myStopOf({ rank: 3, orderState: 'cancelled' }),
        ],
      }),
    });
    const cards = element.querySelectorAll('[data-my-stop]');
    expect(cards[0]?.querySelector('[data-close-without]')).toBeNull();
    expect(cards[1]?.querySelector('[data-order-state]')?.textContent).toContain(
      'Déjà retirée au comptoir',
    );
    expect(cards[2]?.querySelector('[data-order-state]')?.textContent).toContain('Annulée');

    cards[1]?.querySelector<HTMLElement>('[data-close-without]')?.click();
    await settle(fixture);
    const confirm = [...(cards[1]?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
      (button) => button.textContent?.trim() === 'Clore',
    );
    confirm?.click();
    await settle(fixture);
    expect(wire.calls).toContain('close r-1 s-2 {"version":3}');
  });

  it('« Déposé avec preuve » : offert seulement quand l’arrêt le permet, et ouvre le dépôt (B2)', async () => {
    const { fixture, element } = await boot({
      round: myRoundOf({
        departedAt,
        stops: [
          myStopOf({ rank: 1, depositAllowed: true, canDeposit: true }),
          // Dépôt autorisé à l'adresse, mais signature exigée : `canDeposit` est faux (AP-Q6).
          myStopOf({
            rank: 2,
            depositAllowed: true,
            signatureRequired: true,
            canDeposit: false,
          }),
          myStopOf({ rank: 3 }),
        ],
      }),
    });
    const cards = element.querySelectorAll('[data-my-stop]');
    expect(cards[0]?.querySelector('[data-can-deposit]')?.textContent).toContain('Dépôt autorisé');
    expect(cards[0]?.querySelector('[data-deposit]')?.textContent).toContain('Déposé avec preuve');
    expect(cards[1]?.querySelector('[data-deposit]')).toBeNull();
    expect(cards[2]?.querySelector('[data-deposit]')).toBeNull();

    cards[0]?.querySelector<HTMLElement>('[data-deposit]')?.click();
    await settle(fixture);
    expect(cards[0]?.querySelector('[data-deposit-form]')).not.toBeNull();
    expect(cards[0]?.querySelector('[data-hand-over]')).toBeNull();
  });

  it('la décision du commercial se lit sur la carte ; autorisé, le dépôt s’offre même signé (B3)', async () => {
    const decided = {
      source: 'staff',
      decidedAt: '2030-03-12T08:12:00.000Z',
      decidedByName: 'Léa Martin',
    } as const;
    const { element } = await boot({
      round: myRoundOf({
        departedAt,
        stops: [
          // Le serveur calcule `canDeposit` : l'autorisation l'emporte sur la signature (LB-Q5).
          myStopOf({
            rank: 1,
            signatureRequired: true,
            canDeposit: true,
            decision: { state: 'authorize_deposit', ...decided },
          }),
          myStopOf({
            rank: 2,
            decision: { state: 'pending', source: null, decidedAt: null, decidedByName: null },
          }),
          myStopOf({ rank: 3, decision: { state: 'bring_back', ...decided } }),
        ],
      }),
    });
    const cards = element.querySelectorAll('[data-my-stop]');

    expect(cards[0]?.querySelector('[data-decision]')?.textContent).toContain('Autorisé : déposer');
    expect(cards[0]?.querySelector('[data-deposit]')).not.toBeNull();
    expect(cards[1]?.querySelector('[data-decision]')?.textContent).toContain(
      'En attente du commercial',
    );
    expect(cards[1]?.querySelector('[data-deposit]')).toBeNull();
    expect(cards[2]?.querySelector('[data-decision]')?.textContent).toContain('Rapporté');
  });

  it('« Déposé avec preuve » n’est pas offert sur une commande annulée, ni au dépôt', async () => {
    const cancelled = await boot({
      round: myRoundOf({
        departedAt,
        stops: [myStopOf({ rank: 1, canDeposit: true, orderState: 'cancelled' })],
      }),
    });
    expect(cancelled.element.querySelector('[data-deposit]')).toBeNull();
    const atDepot = await boot({
      round: myRoundOf({ departedAt: null, stops: [myStopOf({ rank: 1, canDeposit: true })] }),
    });
    expect(atDepot.element.querySelector('[data-deposit]')).toBeNull();
  });

  it('« Remis au client » : seulement sur une commande à remettre, et ouvre la remise (B1)', async () => {
    const { fixture, element } = await boot({
      round: myRoundOf({
        departedAt,
        stops: [myStopOf({ rank: 1 }), myStopOf({ rank: 2, orderState: 'cancelled' })],
      }),
    });
    const cards = element.querySelectorAll('[data-my-stop]');
    expect(cards[0]?.querySelector('[data-hand-over]')).not.toBeNull();
    expect(cards[1]?.querySelector('[data-hand-over]')).toBeNull();

    cards[0]?.querySelector<HTMLElement>('[data-hand-over]')?.click();
    await settle(fixture);
    expect(cards[0]?.querySelector('[data-handover-form]')).not.toBeNull();
  });

  it('au dépôt, ou tournée rentrée, « Remis au client » n’est pas offert', async () => {
    const atDepot = await boot({ round: myRoundOf({ departedAt: null }) });
    expect(atDepot.element.querySelector('[data-hand-over]')).toBeNull();
    const returned = await boot({
      round: myRoundOf({ departedAt, returnedAt: '2026-10-01T10:30:00.000Z' }),
    });
    expect(returned.element.querySelector('[data-hand-over]')).toBeNull();
  });

  it('un refus du serveur s’affiche tel quel', async () => {
    const message = 'Cette tournée est rentrée : plus aucun geste n’est accepté.';
    const { fixture, element } = await boot({
      round: myRoundOf({ departedAt }),
      refuse: new HttpErrorResponse({ status: 409, error: { message } }),
    });
    click(element, '[data-arrive]');
    await settle(fixture);
    expect(element.querySelector('[data-refusal]')?.textContent?.trim()).toBe(message);
  });

  it('un problème de la tournée : famille, motif, arrêt en cours coché — puis la liste relue', async () => {
    const { fixture, element } = await boot({ round: myRoundOf({ departedAt }) });
    click(element, '[data-report-round]');
    await settle(fixture);

    const form = element.querySelector('[data-round-report]');
    expect(form?.querySelector('[data-family]')).not.toBeNull();
    expect(form?.querySelector('[data-link-current]')?.textContent).toContain('1. Client 1');
  });

  it('liste les signalements de la tournée, photo ouverte par la route du livreur', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:incident');
    const { fixture, element } = await boot({
      round: myRoundOf({ departedAt, incidents: [incidentOf()] }),
    });
    const list = element.querySelector('[data-round-incidents]');
    expect(list?.textContent).toContain('Problème routier · Bouchon');
    expect(list?.textContent).toContain('Bouchon au tunnel');

    click(element, '[data-open-photo]');
    await settle(fixture);
    expect(wire.calls).toContain('photo r-1 i-1');
    expect(element.querySelector('[data-incident] img')?.getAttribute('src')).toBe('blob:incident');
  });

  it('« Tournée terminée » se confirme dans la page, puis la page le dit et n’offre plus rien', async () => {
    const returned = myRoundOf({ departedAt, returnedAt: '2026-10-01T10:30:00.000Z' });
    const { fixture, element } = await boot({
      round: myRoundOf({ departedAt }),
      afterGesture: returned,
    });
    click(element, '[data-return]');
    await settle(fixture);
    // Rien n'est parti avant la confirmation.
    expect(wire.calls.some((call) => call.startsWith('return'))).toBe(false);
    const confirm = [...element.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) =>
        button.textContent?.trim() === 'Tournée terminée' && !button.hasAttribute('data-return'),
    );
    confirm?.click();
    await settle(fixture);

    expect(wire.calls.slice(-2)).toEqual(['return r-1', 'round r-1']);
    expect(element.querySelector('[data-returned]')?.textContent).toContain(
      'Tournée rentrée à 12 h 30',
    );
    expect(element.querySelector('[data-return]')).toBeNull();
    expect(element.querySelector('[data-report-round]')).toBeNull();
    expect(element.querySelector('[data-arrive]')).toBeNull();
    expect(element.querySelector('[data-report-stop]')).toBeNull();
    expect(element.querySelector('[data-go-to]')).toBeNull();
  });
});

describe('MyRoundPage — « Tournée terminée » exige un sort pour chaque arrêt (B4)', () => {
  const departedAt = '2026-10-01T06:00:00.000Z';

  it('nomme avant le clic les arrêts encore sans sort', async () => {
    const { element } = await boot({ round: myRoundOf({ departedAt }) });
    const note = element.querySelector('[data-without-outcome]')?.textContent ?? '';
    expect(note).toContain('1. Client 1, 2. Client 2');
    expect(element.querySelector('[data-return]')).not.toBeNull();
  });

  it('ne dit rien quand chaque arrêt est clos', async () => {
    const closedAt = '2026-10-01T08:00:00.000Z';
    const { element } = await boot({
      round: myRoundOf({
        departedAt,
        stops: [myStopOf({ rank: 1, closedAt }), myStopOf({ rank: 2, closedAt })],
      }),
    });
    expect(element.querySelector('[data-without-outcome]')).toBeNull();
  });
});

describe('MyRoundPage — elle suit le colisage (PL4)', () => {
  it('compte en tête les arrêts prêts, et le dit quand tout l’est', async () => {
    const { element } = await boot({ round: myRoundOf({ readyStops: 1, stopCount: 2 }) });
    expect(element.querySelector('[data-round-head]')?.textContent).toContain('1 arrêt prêt sur 2');
    expect(element.querySelector('[data-all-ready]')).toBeNull();

    const ready = await boot({ round: myRoundOf({ readyStops: 2, stopCount: 2 }) });
    expect(ready.element.querySelector('[data-round-head]')?.textContent).toContain(
      '2 arrêts prêts sur 2',
    );
    expect(ready.element.querySelector('[data-all-ready]')).not.toBeNull();
  });

  it('montre l’avancement, les bacs déclarés, et l’estimation SEULEMENT si elle existe', async () => {
    const { element } = await boot({
      round: myRoundOf({
        stops: [
          myStopOf({ rank: 1, packing: 'ready', bins: 2, binsExpected: 3 }),
          myStopOf({ rank: 2, packing: 'in_progress', bins: 0 }),
        ],
      }),
    });
    const [first, second] = [...element.querySelectorAll('[data-my-stop]')];
    expect(first?.querySelector('[data-packing]')?.textContent).toContain('Prête');
    expect(first?.querySelector('[data-bins]')?.textContent).toContain('2 bacs déclarés');
    expect(first?.querySelector('[data-bins-expected]')?.textContent).toContain(
      'environ 3 attendus',
    );
    expect(second?.querySelector('[data-packing]')?.textContent).toContain('En préparation');
    expect(second?.querySelector('[data-bins]')?.textContent).toContain('aucun bac déclaré');
    expect(second?.querySelector('[data-bins-expected]')).toBeNull();
  });

  it('met la fiche en évidence : produits, quantités, froid', async () => {
    const stop = myStopOf({
      sheet: [
        mySheetLineOf({ sku: 'CRO-01', name: 'Croissant', quantity: 12 }),
        mySheetLineOf({ sku: 'FLAN-01', name: 'Flan', quantity: 2, requiresCold: true }),
      ],
    });
    const { element } = await boot({ round: myRoundOf({ stops: [stop] }) });
    const sheet = element.querySelector('[data-sheet]');
    expect(sheet?.textContent).toContain('Fiche · 2 produits');
    const lines = [...(sheet?.querySelectorAll('[data-sheet-line]') ?? [])];
    expect(lines).toHaveLength(2);
    expect(lines[0]?.textContent).toContain('Croissant');
    expect(lines[0]?.textContent).toContain('× 12');
    expect(lines[0]?.querySelector('[data-sheet-cold]')).toBeNull();
    expect(lines[1]?.querySelector('[data-sheet-cold]')).not.toBeNull();
  });

  it('suit la version de « ma tournée » du jour, et relit la tournée ouverte sans la quitter', async () => {
    const { fixture, element } = await boot();
    expect(watched?.journals).toEqual(['my-round']);
    expect(watched?.date()).toBe(parisDayOf(new Date()));

    wire.round = myRoundOf({ readyStops: 2, stopCount: 2 });
    await watched?.reload();
    await settle(fixture);
    expect(wire.calls.at(-1)).toBe('round r-1');
    expect(element.querySelector('[data-round-head]')?.textContent).toContain(
      '2 arrêts prêts sur 2',
    );
  });

  it('sans tournée ouverte, relit la liste sans en ouvrir une d’office', async () => {
    const { fixture, element } = await boot({ rounds: [summaryOf('r-1'), summaryOf('r-2')] });
    wire.rounds = [summaryOf('r-1')];
    await watched?.reload();
    await settle(fixture);
    expect(wire.calls.at(-1)).toBe(`mine ${parisDayOf(new Date())}`);
    expect(element.querySelectorAll('[data-my-round-choice]')).toHaveLength(1);
    expect(element.querySelector('[data-my-stop]')).toBeNull();
  });
});

describe('MyRoundPage — charger sa tournée (PL1)', () => {
  it('au dépôt, « Charger » ouvre le chargement de SA tournée ; le retour relit la tournée', async () => {
    const { fixture, element } = await boot();
    click(element, '[data-open-loading]');
    await settle(fixture);
    expect(wire.calls).toContain('loading r-1');
    expect(element.querySelector('app-my-round-loading')).not.toBeNull();
    expect(element.querySelector('[data-my-stop]')).toBeNull();

    click(element, '[data-close-loading]');
    await settle(fixture);
    expect(wire.calls.at(-1)).toBe('round r-1');
    expect(element.querySelector('app-my-round-loading')).toBeNull();
    expect(element.querySelectorAll('[data-my-stop]')).toHaveLength(2);
  });

  it('partie, la tournée ne se charge plus : pas de « Charger »', async () => {
    const { element } = await boot({
      round: myRoundOf({ departedAt: '2026-10-01T05:42:00.000Z' }),
    });
    expect(element.querySelector('[data-open-loading]')).toBeNull();
  });
});
