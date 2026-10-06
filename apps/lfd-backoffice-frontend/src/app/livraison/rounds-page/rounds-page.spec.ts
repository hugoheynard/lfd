import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { FoldDropdownItemComponent } from 'fold-ng';
import type {
  DeliveryDayArrestView,
  DeliveryIncidentView,
  DeliveryRoundDriverView,
  DeliveryRoundProposalView,
  DeliveryRoundsDayView,
  DeliveryRunSheetView,
  StaffPermission,
  VehicleView,
} from '@lfd/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { DeliveryIncidentsService } from '../delivery-incidents.service';
import { DeliveryRoundsService } from '../delivery-rounds.service';
import { DeliveryRoutingService } from '../delivery-routing.service';
import { DeliverySettingsService } from '../delivery-settings.service';
import { parisDayOf, shiftDay } from '../run-sheet';
import { stopOf } from '../run-sheet.fixture';
import { RunSheetService } from '../run-sheet.service';
import { MAP_TILES } from '../map-tiles.config';
import { PlannerPopover } from '../planner-popover/planner-popover';
import type { BoardDrop } from '../rounds-board-model';
import { POOL_KEY } from '../rounds-board-model';
import { RoundsBoard } from '../rounds-board/rounds-board';
import { RoundsPage } from './rounds-page';

const WRITE: readonly StaffPermission[] = ['delivery_rounds:read', 'delivery_rounds:write'];

/** Le départ de la première tournée — `null` sauf dans le test qui la fait partir. */
let firstDeparted: string | null = null;
/** Le livreur de la première tournée — `null` sauf dans les tests qui l'affectent. */
let firstDriver: DeliveryRoundDriverView | null = null;
/** Le retour de la première tournée (PL2) — `null` sauf dans les tests qui la rentrent. */
let firstReturned: string | null = null;
/** Les signalements du jour (`plan-a-la-porte.md`, § 3). */
let dayIncidents: readonly DeliveryIncidentView[] = [];

// Un instant affiché, jamais comparé à l'horloge : le badge le dit tel quel.
const BROUGHT_BACK_AT = '2026-10-01T15:00:00.000Z';

function composition(day: string): DeliveryRoundsDayView {
  return {
    day,
    rounds: [
      {
        id: 'r-1',
        vehicleId: 'v-1',
        vehicleName: 'Kangoo',
        passage: 1,
        version: 4,
        vehicleRetired: false,
        planned: null,
        returnedAt: firstReturned,
        departedAt: firstDeparted,
        driver: firstDriver,
        stops: [
          {
            stopId: 's-1',
            orderId: 'o-1',
            reference: 'CMD-1',
            position: 1,
            signals: [],
            orderDay: day,
            broughtBackAt: BROUGHT_BACK_AT,
          },
          {
            stopId: 's-2',
            orderId: 'o-2',
            reference: 'CMD-2',
            position: 2,
            signals: ['cancelled'],
            orderDay: day,
          },
        ],
      },
      {
        id: 'r-2',
        vehicleId: 'v-1',
        vehicleName: 'Kangoo',
        passage: 2,
        version: 7,
        vehicleRetired: true,
        planned: null,
        returnedAt: null,
        departedAt: null,
        driver: null,
        stops: [],
      },
    ],
    unassigned: [
      { orderId: 'o-3', reference: 'CMD-3' },
      { orderId: 'o-4', reference: 'CMD-4', broughtBackAt: BROUGHT_BACK_AT },
    ],
    incidents: dayIncidents,
  };
}

function sheet(day: string): DeliveryRunSheetView {
  return {
    day,
    roundCount: 0,
    stops: [
      stopOf({ orderId: 'o-1', reference: 'CMD-1', tradeName: 'Le Comptoir' }),
      stopOf({ orderId: 'o-3', reference: 'CMD-3' }),
    ],
  };
}

/** Une proposition : CMD-3 placée dans le second passage du Kangoo. */
const PROPOSAL: DeliveryRoundProposalView = {
  day: '2026-10-02',
  estimate: 'road',
  mode: 'insert',
  departurePoint: { pickupAddressId: 'p-1', label: 'Le Labo', gps: { lat: 45.44, lng: 6.98 } },
  settings: {
    detourPercent: 140,
    averageSpeedKmh: 35,
    earliestDeparture: '07:00',
    maxRoundMinutes: 240,
    stopMinutes: 5,
    safetyMarginMinutes: 20,
    defaultMode: 'insert',
    multiplePassages: true,
    source: 'default',
  },
  rounds: [
    {
      roundId: 'r-2',
      vehicleId: 'v-1',
      vehicleName: 'Kangoo',
      passage: 2,
      departureTime: '09:00',
      returnTime: '10:00',
      meters: 1000,
      minutes: 60,
      overDuration: false,
      geometry: null,
      stops: [
        { orderId: 'o-3', reference: 'CMD-3', arrival: '09:10', window: null, windowMissed: false },
      ],
    },
  ],
  unlocated: [],
  overflow: [{ orderId: 'o-4', reference: 'CMD-4' }],
  unfit: [],
  kept: [{ roundId: 'r-1', vehicleName: 'Kangoo', passage: 1, reason: 'not_requested' }],
  versions: [
    { roundId: 'r-1', version: 4 },
    { roundId: 'r-2', version: 7 },
  ],
};

interface Wire {
  readonly calls: string[];
  readonly reads: { rounds: string[]; sheets: string[]; also: (readonly string[])[] };
  refuse: HttpErrorResponse | null;
}

let wire: Wire;

/** Ce que la livraison a appris de la clôture (CA6a) ; nul par défaut : plan non arrêté. */
let arrested: DeliveryDayArrestView | null = null;

function outcome(call: string): Promise<void> {
  wire.calls.push(call);
  return wire.refuse === null ? Promise.resolve() : Promise.reject(wire.refuse);
}

/** Les lectures sont chaînées (deux en parallèle, puis la jointure) : on laisse la file se vider. */
async function settle(fixture: ComponentFixture<RoundsPage>): Promise<void> {
  for (let turn = 0; turn < 4; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }
  fixture.detectChanges();
}

async function boot(
  grants: readonly StaffPermission[] = WRITE,
  sheetRead: (day: string) => Promise<DeliveryRunSheetView> = (day) => Promise.resolve(sheet(day)),
  query: Record<string, string> = {},
): Promise<{ fixture: ComponentFixture<RoundsPage>; element: HTMLElement }> {
  wire = { calls: [], reads: { rounds: [], sheets: [], also: [] }, refuse: null };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: MAP_TILES, useValue: { baseUrl: '', wholeFile: false } },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(query) } },
      },
      {
        provide: DeliveryRoundsService,
        useValue: {
          day: (day: string) => {
            wire.reads.rounds.push(day);
            return Promise.resolve(composition(day));
          },
          open: (payload: unknown) => outcome(`open ${JSON.stringify(payload)}`),
          roundPdf: (roundId: string) =>
            outcome(`pdf ${roundId}`).then(() => new Blob(['%PDF'], { type: 'application/pdf' })),
          assign: (roundId: string, payload: unknown) =>
            outcome(`assign ${roundId} ${JSON.stringify(payload)}`),
          move: (roundId: string, stopId: string, payload: unknown) =>
            outcome(`move ${roundId} ${stopId} ${JSON.stringify(payload)}`),
          reorder: (roundId: string, payload: unknown) =>
            outcome(`reorder ${roundId} ${JSON.stringify(payload)}`),
          remove: (roundId: string, stopId: string, payload: unknown) =>
            outcome(`remove ${roundId} ${stopId} ${JSON.stringify(payload)}`),
          drivers: () =>
            Promise.resolve({
              drivers: [
                { staffUserId: 'u-1', name: 'Paul Livreur' },
                { staffUserId: 'u-2', name: 'Zoé Volant' },
              ],
            }),
          assignDriver: (roundId: string, payload: unknown) =>
            outcome(`assignDriver ${roundId} ${JSON.stringify(payload)}`),
          unassignDriver: (roundId: string, payload: unknown) =>
            outcome(`unassignDriver ${roundId} ${JSON.stringify(payload)}`),
          returnToDepot: (roundId: string) => outcome(`return ${roundId}`),
          readiness: (day: string) => Promise.resolve({ day, arrested }),
        } satisfies Partial<Record<keyof DeliveryRoundsService, unknown>>,
      },
      {
        provide: RunSheetService,
        useValue: {
          day: (day: string, also: readonly string[] = []) => {
            wire.reads.sheets.push(day);
            wire.reads.also.push(also);
            return sheetRead(day);
          },
        },
      },
      {
        provide: DeliverySettingsService,
        useValue: {
          vehicles: () =>
            Promise.resolve({
              vehicles: [
                {
                  id: 'v-1',
                  name: 'Kangoo',
                  plate: 'AB',
                  retiredAt: null,
                  createdAt: '2026-01-01T08:00:00.000Z',
                  cargo: { lengthCm: 250, widthCm: 170, heightCm: 130, volumeLiters: 5525 },
                  wheelArches: null,
                  refrigeration: { volumeLiters: 400, minTempC: 0, maxTempC: 4 },
                  energy: null,
                } satisfies VehicleView,
              ],
            }),
          departure: () => Promise.reject(new Error('non lu')),
        } satisfies Partial<Record<keyof DeliverySettingsService, unknown>>,
      },
      {
        provide: DeliveryRoutingService,
        useValue: {
          // Sans calcul routier : la carte garde ses repères, l'aperçu ses heures d'origine.
          time: () => Promise.reject(new Error('pas de calcul routier')),
          settings: () => Promise.reject(new Error('non lu')),
          apply: (payload: unknown) => outcome(`apply ${JSON.stringify(payload)}`),
        } satisfies Partial<Record<keyof DeliveryRoutingService, unknown>>,
      },
      {
        provide: DeliveryIncidentsService,
        useValue: {
          photo: (incidentId: string): Promise<Blob> => {
            wire.calls.push(`photo ${incidentId}`);
            return Promise.resolve(new Blob(['x']));
          },
        } satisfies Partial<Record<keyof DeliveryIncidentsService, unknown>>,
      },
      { provide: NotifyService, useValue: { success: () => undefined } },
      {
        provide: PermissionsStore,
        useValue: { can: (permission: StaffPermission) => grants.includes(permission) },
      },
    ],
  });
  const fixture = TestBed.createComponent(RoundsPage);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

function button(element: Element | null | undefined, selector: string): HTMLButtonElement {
  const found = element?.querySelector<HTMLButtonElement>(`${selector} button, button${selector}`);
  if (found === null || found === undefined) {
    throw new Error(`bouton introuvable : ${selector}`);
  }
  return found;
}

/** Un geste du tableau, tel que le glisser-déposer le remonte. */
async function drop(fixture: ComponentFixture<RoundsPage>, gesture: BoardDrop): Promise<void> {
  fixture.debugElement.query(By.directive(RoundsBoard)).triggerEventHandler('dropped', gesture);
  await settle(fixture);
}

/** Choisit une entrée du menu « livreur » d'une tournée, comme le menu fold l'émet. */
function chooseDriver(fixture: ComponentFixture<RoundsPage>, index: number): void {
  const option = fixture.debugElement.queryAll(By.css('[data-round] [data-driver-option]'))[index];
  // La vraie entrée de menu fold, pas un élément quelconque : c'est elle qui est pilotée.
  expect(option?.componentInstance).toBeInstanceOf(FoldDropdownItemComponent);
  option?.triggerEventHandler('selected');
}

afterEach(() => {
  vi.restoreAllMocks();
  firstReturned = null;
  dayIncidents = [];
});

describe('RoundsPage', () => {
  it('une tournée partie est gelée, et dit son heure de départ (lot 4)', async () => {
    firstDeparted = '2026-10-01T05:42:00.000Z';
    try {
      const { element } = await boot();
      const first = element.querySelector('[data-round]');
      expect(first?.querySelector('[data-round-state]')?.textContent).toContain('Partie 7 h 42');
      expect(first?.textContent).toContain('Partie : gelée, rien ne s’y déplace.');
      expect(first?.querySelector('[data-remove]')).toBeNull();
      expect(first?.querySelector('[data-down]')).toBeNull();
      // L'autre tournée reste en préparation, et seule elle reçoit « Mettre dans ».
      const second = element.querySelectorAll('[data-round]')[1];
      expect(second?.querySelector('[data-round-state]')?.textContent).toContain('En préparation');
      const targets = [...element.querySelectorAll('[data-order] [data-assign]')];
      expect(targets.map((target) => target.textContent?.trim())).toEqual([
        'Kangoo · 2',
        'Kangoo · 2',
      ]);
    } finally {
      firstDeparted = null;
    }
  });

  it('lit demain par défaut, composition puis feuille de route, qui reçoit les rapportées (C16)', async () => {
    await boot();
    const tomorrow = shiftDay(parisDayOf(new Date()), 1);
    expect(wire.reads).toEqual({ rounds: [tomorrow], sheets: [tomorrow], also: [['o-4']] });
  });

  it('dit l’échec d’une des deux lectures en alerte : l’une sans l’autre n’est rien', async () => {
    const { element } = await boot(WRITE, () => Promise.reject(new Error('500')));
    expect(element.querySelector('[data-compose-error]')?.getAttribute('tone')).toBe('alert');
  });

  it('montre « À répartir », un bloc par véhicule, une colonne par passage, et ce qui cloche', async () => {
    const { element } = await boot();
    expect(element.querySelector('[data-unassigned]')?.textContent).toContain('CMD-3');
    expect(element.querySelector('[data-summary-pool]')?.textContent).toContain('2 à répartir');

    // Deux passages du même véhicule : un seul bloc, deux colonnes (Q13).
    expect(element.querySelectorAll('[data-vehicle-group]')).toHaveLength(1);
    expect(element.querySelector('[data-passages]')?.textContent).toContain('2 passages');
    // Le chargement du véhicule, en lecture seule (L2b-C3).
    expect(element.querySelector('[data-load]')?.textContent).toContain('5,5 m³ ❄');

    const rounds = [...element.querySelectorAll('[data-round]')];
    expect(rounds).toHaveLength(2);
    expect(rounds[0]?.querySelector('[data-round-title]')?.textContent).toContain('Passage 1');
    expect(rounds[0]?.textContent).toContain('part en premier');
    expect(rounds[0]?.querySelector('[data-stop-count]')?.textContent).toContain('2 arrêts');
    expect(rounds[1]?.querySelector('[data-round-title]')?.textContent).toContain('Passage 2');
    expect(rounds[1]?.textContent).toContain('après le passage 1');
    expect(rounds[1]?.querySelector('[data-retired]')).not.toBeNull();

    const stops = [...(rounds[0]?.querySelectorAll('[data-stop]') ?? [])];
    expect(stops[0]?.textContent).toContain('CMD-1');
    // Absent de la feuille du jour : sa référence et son signal, quand même.
    expect(stops[1]?.textContent).toContain('CMD-2');
    expect(stops[1]?.textContent).toContain('Commande annulée');
    // Le signal met « Retirer de la tournée » en avant (Q11).
    expect(button(stops[1], '[data-remove]').className).toContain('danger');
    expect(element.querySelector('[data-summary-alerts]')?.textContent).toContain('1 à régler');
  });

  it('badge « Rapportée le … » sur une commande rapportée, à répartir comme placée (RL1)', async () => {
    const { element } = await boot();
    const orders = [...element.querySelectorAll('[data-unassigned] [data-order]')];
    expect(orders[0]?.textContent).not.toContain('Rapportée le');
    expect(orders[1]?.textContent).toContain('Rapportée le jeudi 1 octobre');
    const stop = element.querySelector('[data-round] [data-stop]');
    expect(stop?.textContent).toContain('Rapportée le jeudi 1 octobre');
  });

  it('descend un arrêt en envoyant la permutation complète et la version', async () => {
    const { fixture, element } = await boot();
    const first = element.querySelector('[data-round] [data-stop]');
    button(first, '[data-down]').click();
    await settle(fixture);
    expect(wire.calls).toEqual(['reorder r-1 {"stopIds":["s-2","s-1"],"version":4}']);
  });

  it('glisse un arrêt plus haut dans sa tournée : la permutation entière (I2)', async () => {
    const { fixture } = await boot();
    await drop(fixture, {
      orderId: 'o-2',
      from: { list: 'r-1', index: 1 },
      to: { list: 'r-1', index: 0 },
    });
    expect(wire.calls).toEqual(['reorder r-1 {"stopIds":["s-2","s-1"],"version":4}']);
  });

  it('« Annuler » renvoie la permutation exacte d’avant', async () => {
    const { fixture, element } = await boot();
    button(element.querySelector('[data-round] [data-stop]'), '[data-down]').click();
    await settle(fixture);
    expect(element.querySelector('[data-undo-text]')?.textContent).toContain(
      'CMD-1 → Kangoo · arrêt 2',
    );

    button(element, '[data-undo]').click();
    await settle(fixture);
    expect(wire.calls).toEqual([
      'reorder r-1 {"stopIds":["s-2","s-1"],"version":4}',
      'reorder r-1 {"stopIds":["s-1","s-2"],"version":4}',
    ]);
    expect(element.querySelector('[data-undo-toast]')).toBeNull();
  });

  it('retire un arrêt avec la version de sa tournée', async () => {
    const { fixture, element } = await boot();
    const stops = element.querySelectorAll('[data-round] [data-stop]');
    button(stops[1], '[data-remove]').click();
    await settle(fixture);
    expect(wire.calls).toEqual(['remove r-1 s-2 {"version":4}']);
    expect(element.querySelector('[data-undo-text]')?.textContent).toContain(
      'CMD-2 retirée · à répartir',
    );
  });

  it('glisser un arrêt vers « À répartir » le retire', async () => {
    const { fixture } = await boot();
    await drop(fixture, {
      orderId: 'o-1',
      from: { list: 'r-1', index: 0 },
      to: { list: POOL_KEY, index: 0 },
    });
    expect(wire.calls).toEqual(['remove r-1 s-1 {"version":4}']);
  });

  it('nomme à la feuille de route les rapportées à replacer (decisions-par-defaut § 4)', async () => {
    await boot();

    expect(wire.reads.also).toEqual([['o-4']]);
  });

  it('409 : dit que la composition a changé et RELIT, sans réessayer', async () => {
    const { fixture, element } = await boot();
    wire.refuse = new HttpErrorResponse({
      status: 409,
      error: { message: 'La tournée a été modifiée entre-temps.' },
    });
    const first = element.querySelector('[data-round] [data-stop]');
    button(first, '[data-down]').click();
    await settle(fixture);

    expect(wire.calls).toHaveLength(1);
    expect(wire.reads.rounds).toHaveLength(2);
    expect(wire.reads.sheets).toHaveLength(2);
    expect(element.querySelector('[data-refusal]')?.textContent).toContain(
      'La tournée a été modifiée entre-temps.',
    );
    // Un geste refusé ne s'annule pas : il n'a pas eu lieu.
    expect(element.querySelector('[data-undo-toast]')).toBeNull();
  });

  it('lecture seule : ni poignée, ni « Mettre dans », ni ↑ ↓, ni « Proposer » — la carte et les onglets restent', async () => {
    const { element } = await boot(['delivery_rounds:read']);
    expect(element.querySelector('[data-stop]')).not.toBeNull();
    for (const selector of [
      '[data-remove]',
      '[data-down]',
      '[data-assign]',
      '[data-open-round]',
      '[data-planner-open]',
    ]) {
      expect(element.querySelector(selector)).toBeNull();
    }
    expect(element.querySelector('[data-order]')?.textContent).not.toContain('⋮⋮');
    expect(element.querySelector('[data-tab="all"]')).not.toBeNull();
    expect(element.querySelector('[data-map-panel]')).not.toBeNull();
  });

  it('« Imprimer » ouvre le PDF serveur de LA tournée dans un nouvel onglet', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:tournee');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const { fixture, element } = await boot();
    element.querySelector<HTMLButtonElement>('[data-round] [data-print] button')?.click();
    await settle(fixture);

    expect(wire.calls).toEqual(['pdf r-1']);
    expect(open).toHaveBeenCalledWith('blob:tournee', '_blank');
    expect(element.querySelector('[data-pdf-blocked] a')?.getAttribute('href')).toBe(
      'blob:tournee',
    );
    expect(element.querySelector('[data-pdf-failed]')).toBeNull();
    vi.restoreAllMocks();
  });

  it('un PDF refusé s’affiche en callout, sans ouvrir d’onglet', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { fixture, element } = await boot();
    wire.refuse = new HttpErrorResponse({ status: 500 });
    element.querySelector<HTMLButtonElement>('[data-round] [data-print] button')?.click();
    await settle(fixture);

    expect(wire.calls).toEqual(['pdf r-1']);
    expect(open).not.toHaveBeenCalled();
    expect(element.querySelector('fold-callout[data-pdf-failed]')).not.toBeNull();
    vi.restoreAllMocks();
  });

  it('« Mettre dans » affecte la commande à la tournée choisie, avec SA version, puis relit', async () => {
    const { fixture, element } = await boot();
    // « Kangoo · 2 » : le second passage, pas le premier.
    element
      .querySelector('[data-unassigned] [data-order]')
      ?.querySelectorAll<HTMLButtonElement>('[data-assign]')[1]
      ?.click();
    await settle(fixture);

    expect(wire.calls).toEqual(['assign r-2 {"orderId":"o-3","version":7}']);
    expect(wire.reads.rounds.length).toBeGreaterThan(1);
    expect(wire.reads.sheets.length).toBe(wire.reads.rounds.length);
  });

  it('glisse un arrêt vers l’autre tournée avec les versions des DEUX tournées, puis relit', async () => {
    const { fixture } = await boot();
    await drop(fixture, {
      orderId: 'o-2',
      from: { list: 'r-1', index: 1 },
      to: { list: 'r-2', index: 0 },
    });

    expect(wire.calls).toEqual(['move r-1 s-2 {"toRoundId":"r-2","fromVersion":4,"toVersion":7}']);
    expect(wire.reads.rounds.length).toBeGreaterThan(1);
  });

  it('ne déplace rien quand l’arrêt retombe à sa place', async () => {
    const { fixture } = await boot();
    await drop(fixture, {
      orderId: 'o-1',
      from: { list: 'r-1', index: 0 },
      to: { list: 'r-1', index: 0 },
    });
    expect(wire.calls).toEqual([]);
  });

  it('un dépôt sur une tournée partie est refusé, sans aucun appel au serveur (I6)', async () => {
    firstDeparted = '2026-10-01T05:42:00.000Z';
    try {
      const { fixture, element } = await boot();
      await drop(fixture, {
        orderId: 'o-3',
        from: { list: POOL_KEY, index: 0 },
        to: { list: 'r-1', index: 0 },
      });
      expect(wire.calls).toEqual([]);
      expect(element.querySelector('[data-undo-text]')?.textContent).toContain(
        'Kangoo est partie : rien ne s’y dépose.',
      );
      expect(element.querySelector('[data-undo]')).toBeNull();
    } finally {
      firstDeparted = null;
    }
  });

  it('un dépôt sur l’onglet d’un véhicule sans tournée en préparation : le dire, sans appel', async () => {
    const { fixture, element } = await boot();
    fixture.debugElement
      .query(By.directive(RoundsBoard))
      .triggerEventHandler('noTarget', 'Trafic frigo');
    await settle(fixture);
    expect(wire.calls).toEqual([]);
    expect(element.querySelector('[data-undo-text]')?.textContent).toContain(
      'Trafic frigo : aucune tournée en préparation.',
    );
  });

  it('rouvre le jour de l’URL, et retombe sur demain si le paramètre est illisible', async () => {
    await boot(WRITE, undefined, { jour: '2026-10-24' });
    expect(wire.reads.rounds).toEqual(['2026-10-24']);

    await boot(WRITE, undefined, { jour: '2026-02-30' });
    expect(wire.reads.rounds).toEqual([shiftDay(parisDayOf(new Date()), 1)]);
  });

  it('« Autre jour » ouvre la date, qui s’écrit dans l’URL sans empiler l’historique', async () => {
    const { fixture, element } = await boot();
    expect(element.querySelector('[data-day-bar] fold-date')).toBeNull();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.debugElement
      .query(By.css('[data-day-bar] fold-view-toggle'))
      .triggerEventHandler('valueChange', 'other');
    fixture.detectChanges();
    fixture.debugElement
      .query(By.css('[data-day-bar] fold-date'))
      .triggerEventHandler('valueChange', '2026-10-24');
    await settle(fixture);

    expect(wire.reads.rounds.at(-1)).toBe('2026-10-24');
    expect(element.querySelector('[data-day-label]')?.textContent).toContain('samedi 24 octobre');
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { jour: '2026-10-24' }, replaceUrl: true }),
    );
  });

  describe('l’aperçu d’une proposition (§ 6)', () => {
    async function proposeIn(fixture: ComponentFixture<RoundsPage>): Promise<void> {
      fixture.debugElement
        .query(By.directive(PlannerPopover))
        .triggerEventHandler('proposed', { proposal: PROPOSAL, recomposed: false });
      await settle(fixture);
    }

    it('remplit le même tableau : arrêts proposés en bleu, le reste à répartir avec sa raison', async () => {
      const { fixture, element } = await boot();
      await proposeIn(fixture);

      expect(element.querySelector('[data-proposal-mode]')?.textContent).toContain(
        'Insérer dans les tournées existantes — rien n’est écrit tant que vous n’appliquez pas.',
      );
      const second = element.querySelectorAll('[data-round]')[1];
      expect(second?.querySelector('[data-position]')?.className).toContain('num-proposed');
      expect(element.querySelector('[data-unassigned]')?.textContent).toContain(
        'Ne tient dans aucune tournée (durée max.)',
      );
      expect(element.querySelector('[data-unassigned]')?.textContent).toContain(
        'Ce que le calcul n’a pas placé, avec sa raison.',
      );
    });

    it('« Jeter » n’écrit rien, et rend la composition', async () => {
      const { fixture, element } = await boot();
      await proposeIn(fixture);
      button(element, '[data-discard]').click();
      await settle(fixture);

      expect(wire.calls).toEqual([]);
      expect(element.querySelector('[data-preview]')).toBeNull();
      expect(element.querySelector('[data-unassigned]')?.textContent).toContain('CMD-3');
    });

    it('un glisser en aperçu n’écrit rien ; « Appliquer » écrit la proposition AJUSTÉE', async () => {
      const { fixture, element } = await boot();
      await proposeIn(fixture);
      // CMD-4, que le calcul n'a pas su placer, glissée à la main en tête du passage 2.
      await drop(fixture, {
        orderId: 'o-4',
        from: { list: POOL_KEY, index: 0 },
        to: { list: 'r-2', index: 0 },
      });
      expect(wire.calls).toEqual([]);

      button(element, '[data-apply]').click();
      await settle(fixture);
      expect(wire.calls).toEqual([
        `apply ${JSON.stringify({
          day: '2026-10-02',
          rounds: [{ roundId: 'r-2', vehicleId: 'v-1', orderIds: ['o-4', 'o-3'] }],
          versions: [
            { roundId: 'r-1', version: 4 },
            { roundId: 'r-2', version: 7 },
          ],
        })}`,
      ]);
      expect(element.querySelector('[data-preview]')).toBeNull();
    });
  });

  describe('le livreur d’une tournée (MT2)', () => {
    afterEach(() => {
      firstDriver = null;
      firstDeparted = null;
    });

    it('invite à choisir un livreur, et affecte avec la version lue', async () => {
      const { fixture, element } = await boot();
      const first = element.querySelector('[data-round]');
      expect(first?.querySelector('[data-driver-name]')?.textContent).toContain(
        'Choisir un livreur',
      );
      chooseDriver(fixture, 1);
      await settle(fixture);
      expect(wire.calls).toEqual(['assignDriver r-1 {"staffUserId":"u-2","version":4}']);
    });

    it('nomme le livreur, le retire, et signale celui qui a perdu l’accès', async () => {
      firstDriver = { staffUserId: 'u-1', name: 'Paul Livreur', canDrive: false };
      const { fixture, element } = await boot();
      const first = element.querySelector('[data-round]');
      expect(first?.querySelector('[data-driver-name]')?.textContent).toContain('Paul Livreur');
      expect(first?.querySelector('[data-driver-no-access]')?.getAttribute('content')).toBe(
        'Livreur sans accès — réaffecter',
      );
      fixture.debugElement
        .query(By.css('[data-round] [data-driver-remove]'))
        .triggerEventHandler('selected');
      await settle(fixture);
      expect(wire.calls).toEqual(['unassignDriver r-1 {"version":4}']);
    });

    it('affiche le refus du serveur tel quel', async () => {
      const { fixture, element } = await boot();
      const message = 'Kangoo est déjà partie : son livreur ne change plus.';
      wire.refuse = new HttpErrorResponse({ status: 409, error: { message } });
      chooseDriver(fixture, 0);
      await settle(fixture);
      expect(element.querySelector('[data-refusal]')?.textContent?.trim()).toBe(message);
    });

    it('une tournée partie ne s’affecte plus : le nom seul', async () => {
      firstDeparted = '2026-10-01T05:42:00.000Z';
      firstDriver = { staffUserId: 'u-1', name: 'Paul Livreur', canDrive: true };
      const { element } = await boot();
      const first = element.querySelector('[data-round]');
      expect(first?.querySelector('[data-driver-name]')?.textContent).toContain('Paul Livreur');
      expect(first?.querySelector('[data-driver-choice]')).toBeNull();
      expect(first?.querySelector('[data-driver-remove]')).toBeNull();
    });

    it('sans `delivery_rounds:write`, ni choix ni lecture des livreurs', async () => {
      const { element } = await boot(['delivery_rounds:read']);
      expect(element.querySelector('[data-driver-choice]')).toBeNull();
      expect(element.querySelector('[data-driver-name]')?.textContent).toContain('Aucun livreur');
    });
  });
});

describe('RoundsPage — à la porte (lot A, PL2)', () => {
  const departedAt = '2026-10-01T05:42:00.000Z';

  afterEach(() => {
    firstDeparted = null;
  });

  function incidentOf(overrides: Partial<DeliveryIncidentView>): DeliveryIncidentView {
    return {
      id: 'i-1',
      roundId: 'r-1',
      stopId: null,
      orderReference: null,
      family: 'technical',
      reason: 'cold_failure',
      note: '',
      hasPhoto: false,
      reportedAt: '2026-10-01T06:10:00.000Z',
      reportedBy: { staffUserId: 'u-1', name: 'Paul Livreur' },
      ...overrides,
    };
  }

  it('pose les signalements sur la tournée et sur l’arrêt concernés, photo sous delivery_rounds', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:incident');
    firstDeparted = departedAt;
    dayIncidents = [
      incidentOf({ id: 'i-1' }),
      incidentOf({
        id: 'i-2',
        stopId: 's-1',
        orderReference: 'CMD-1',
        family: 'doorstep',
        reason: 'nobody_present',
        hasPhoto: true,
      }),
    ];
    const { fixture, element } = await boot();
    const round = element.querySelectorAll('[data-round]')[0];
    expect(round?.querySelector('[data-round-incidents]')?.textContent).toContain('2 signalements');
    const stops = round?.querySelectorAll('[data-stop]');
    expect(stops?.[0]?.querySelector('[data-stop-incidents]')?.textContent).toContain(
      'Problème à la remise · Personne pour réceptionner',
    );
    expect(stops?.[1]?.querySelector('[data-stop-incidents]')).toBeNull();
    expect(
      element.querySelectorAll('[data-round]')[1]?.querySelector('[data-round-incidents]'),
    ).toBeNull();

    stops?.[0]?.querySelector<HTMLElement>('[data-open-photo]')?.click();
    await settle(fixture);
    expect(wire.calls).toContain('photo i-2');
  });

  it('« Déclarer rentrée » sous delivery_rounds:write, pour une tournée partie et non rentrée', async () => {
    firstDeparted = departedAt;
    const { fixture, element } = await boot();
    const rounds = element.querySelectorAll('[data-round]');
    expect(rounds[1]?.querySelector('[data-return-round]')).toBeNull();

    button(rounds[0], '[data-return-round]').click();
    await settle(fixture);
    const confirm = [...(rounds[0]?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
      (candidate) =>
        candidate.textContent?.trim() === 'Déclarer rentrée' &&
        !candidate.hasAttribute('data-return-round'),
    );
    confirm?.click();
    await settle(fixture);
    expect(wire.calls).toEqual(['return r-1']);
  });

  it('sans delivery_rounds:write, pas de « Déclarer rentrée »', async () => {
    firstDeparted = departedAt;
    const { element } = await boot(['delivery_rounds:read']);
    expect(element.querySelector('[data-return-round]')).toBeNull();
  });

  it('une tournée rentrée le dit, et ne propose plus de la déclarer', async () => {
    firstDeparted = departedAt;
    firstReturned = '2026-10-01T10:30:00.000Z';
    const { element } = await boot();
    const first = element.querySelectorAll('[data-round]')[0];
    expect(first?.querySelector('[data-round-state]')?.textContent).toContain('Rentrée 12 h 30');
    expect(first?.querySelector('[data-return-round]')).toBeNull();
  });
});

describe('RoundsPage — le plan arrêté (CA6a)', () => {
  afterEach(() => {
    arrested = null;
  });

  it('plan non arrêté : aucun bandeau', async () => {
    const { element } = await boot();

    expect(element.querySelector('[data-readiness-arrested]')).toBeNull();
    expect(element.querySelector('[data-readiness-gap]')).toBeNull();
  });

  it('arrêté : « Proposer les tournées » du bandeau ouvre le panneau', async () => {
    arrested = {
      closedAt: '2026-10-06T16:00:00.000Z',
      deliveryCount: 12,
      unplacedCount: 3,
      compositionGap: null,
    };
    const { fixture, element } = await boot();

    expect(element.querySelector('[data-readiness-arrested]')?.textContent).toContain(
      '12 livraisons, dont 3 hors tournée',
    );
    button(element, '[data-readiness-propose]').click();
    fixture.detectChanges();

    const planner = fixture.debugElement.query(By.directive(PlannerPopover))
      .componentInstance as PlannerPopover;
    expect(planner.open()).toBe(true);
  });
});
