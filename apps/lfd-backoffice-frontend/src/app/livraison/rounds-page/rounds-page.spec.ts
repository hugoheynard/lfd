import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { FoldListboxComponent } from 'fold-ng';
import type {
  DeliveryRoundsDayView,
  DeliveryRunSheetView,
  StaffPermission,
  VehicleView,
} from '@lfd/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { DeliveryRoundsService } from '../delivery-rounds.service';
import { DeliveryRoutingService } from '../delivery-routing.service';
import { DeliverySettingsService } from '../delivery-settings.service';
import { parisDayOf, shiftDay } from '../run-sheet';
import { stopOf } from '../run-sheet.fixture';
import { RunSheetService } from '../run-sheet.service';
import { RoundsPage } from './rounds-page';

const WRITE: readonly StaffPermission[] = ['delivery_rounds:read', 'delivery_rounds:write'];

/** Le départ de la première tournée — `null` sauf dans le test qui la fait partir. */
let firstDeparted: string | null = null;

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
        departedAt: firstDeparted,
        stops: [
          {
            stopId: 's-1',
            orderId: 'o-1',
            reference: 'CMD-1',
            position: 1,
            signals: [],
            orderDay: day,
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
        departedAt: null,
        stops: [],
      },
    ],
    unassigned: [{ orderId: 'o-3', reference: 'CMD-3' }],
  };
}

function sheet(day: string): DeliveryRunSheetView {
  return {
    day,
    stops: [
      stopOf({ orderId: 'o-1', reference: 'CMD-1', tradeName: 'Le Comptoir' }),
      stopOf({ orderId: 'o-3', reference: 'CMD-3' }),
    ],
  };
}

interface Wire {
  readonly calls: string[];
  readonly reads: { rounds: string[]; sheets: string[] };
  refuse: HttpErrorResponse | null;
}

let wire: Wire;

function outcome(call: string): Promise<void> {
  wire.calls.push(call);
  return wire.refuse === null ? Promise.resolve() : Promise.reject(wire.refuse);
}

/** Les lectures sont chaînées (deux en parallèle, puis la jointure) : on laisse la file se vider. */
async function settle(fixture: ComponentFixture<RoundsPage>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

async function boot(
  grants: readonly StaffPermission[] = WRITE,
  sheetRead: (day: string) => Promise<DeliveryRunSheetView> = (day) => Promise.resolve(sheet(day)),
  query: Record<string, string> = {},
): Promise<{ fixture: ComponentFixture<RoundsPage>; element: HTMLElement }> {
  wire = { calls: [], reads: { rounds: [], sheets: [] }, refuse: null };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
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
          assign: (roundId: string, payload: unknown) =>
            outcome(`assign ${roundId} ${JSON.stringify(payload)}`),
          move: (roundId: string, stopId: string, payload: unknown) =>
            outcome(`move ${roundId} ${stopId} ${JSON.stringify(payload)}`),
          reorder: (roundId: string, payload: unknown) =>
            outcome(`reorder ${roundId} ${JSON.stringify(payload)}`),
          remove: (roundId: string, stopId: string, payload: unknown) =>
            outcome(`remove ${roundId} ${stopId} ${JSON.stringify(payload)}`),
        } satisfies Partial<Record<keyof DeliveryRoundsService, unknown>>,
      },
      {
        provide: RunSheetService,
        useValue: {
          day: (day: string) => {
            wire.reads.sheets.push(day);
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
                } satisfies VehicleView,
              ],
            }),
        },
      },
      // Le calculateur a sa propre spec : ici, il ne doit que tenir dans la page.
      { provide: DeliveryRoutingService, useValue: {} },
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

/** Choisit une tournée dans la liste « Tournée » d'un conteneur, comme la listbox l'émet. */
function choose(fixture: ComponentFixture<RoundsPage>, selector: string, roundId: string): void {
  const listbox = fixture.debugElement.query(By.css(selector));
  // La vraie listbox fold, pas un élément quelconque : c'est son sélecteur qui est piloté.
  expect(listbox.componentInstance).toBeInstanceOf(FoldListboxComponent);
  listbox.triggerEventHandler('selectionChange', roundId);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RoundsPage', () => {
  it('une tournée partie est en lecture seule, et dit son heure de départ (lot 4)', async () => {
    firstDeparted = '2026-10-01T05:42:00.000Z';
    try {
      const { element } = await boot();
      const first = element.querySelector('[data-round]');
      expect(first?.querySelector('[data-departed]')?.textContent).toContain('Partie à 7 h 42');
      expect(first?.querySelector('[data-remove]')).toBeNull();
      expect(first?.querySelector('[data-move]')).toBeNull();
      // L'autre tournée garde ses gestes, et la partie n'est plus proposée.
      expect(
        element.querySelectorAll('[data-round]')[1]?.querySelector('[data-departed]'),
      ).toBeNull();
    } finally {
      firstDeparted = null;
    }
  });

  it('lit demain par défaut, composition ET feuille de route ensemble (C16)', async () => {
    await boot();
    const tomorrow = shiftDay(parisDayOf(new Date()), 1);
    expect(wire.reads).toEqual({ rounds: [tomorrow], sheets: [tomorrow] });
  });

  it('dit l’échec d’une des deux lectures en alerte : l’une sans l’autre n’est rien', async () => {
    const { element } = await boot(WRITE, () => Promise.reject(new Error('500')));
    expect(element.querySelector('[data-compose-error]')?.getAttribute('tone')).toBe('alert');
  });

  it('montre la colonne à répartir, une colonne par tournée, et ce qui cloche', async () => {
    const { element } = await boot();
    expect(element.querySelector('[data-unassigned]')?.textContent).toContain('CMD-3');

    const rounds = [...element.querySelectorAll('[data-round]')];
    expect(rounds).toHaveLength(2);
    expect(rounds[0]?.textContent).toContain('2 arrêts');
    expect(rounds[1]?.textContent).toContain('Kangoo · passage 2');
    expect(rounds[1]?.querySelector('[data-retired]')).not.toBeNull();

    const stops = [...(rounds[0]?.querySelectorAll('[data-stop]') ?? [])];
    expect(stops[0]?.textContent).toContain('CMD-1 · Le Comptoir');
    // Absent de la feuille du jour : sa référence et son signal, quand même.
    expect(stops[1]?.textContent).toContain('CMD-2');
    expect(stops[1]?.querySelector('[data-signal]')?.textContent).toContain('Commande annulée');
    // Le signal met le bouton Retirer en avant (Q11).
    expect(button(stops[1], '[data-remove]').className).toContain('danger');
  });

  it('descend un arrêt en envoyant la permutation complète et la version', async () => {
    const { fixture, element } = await boot();
    const first = element.querySelector('[data-round] [data-stop]');
    button(first, '[data-down]').click();
    await settle(fixture);
    expect(wire.calls).toEqual(['reorder r-1 {"stopIds":["s-2","s-1"],"version":4}']);
  });

  it('retire un arrêt avec la version de sa tournée', async () => {
    const { fixture, element } = await boot();
    const stops = element.querySelectorAll('[data-round] [data-stop]');
    button(stops[1], '[data-remove]').click();
    await settle(fixture);
    expect(wire.calls).toEqual(['remove r-1 s-2 {"version":4}']);
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
  });

  it('cache toute écriture sans `delivery_rounds:write`', async () => {
    const { element } = await boot(['delivery_rounds:read']);
    expect(element.querySelector('[data-stop]')).not.toBeNull();
    for (const selector of ['[data-remove]', '[data-down]', '[data-move]', '[data-assign]']) {
      expect(element.querySelector(selector)).toBeNull();
    }
    expect(element.querySelector('[data-open-round]')).toBeNull();
  });

  it('imprime UNE tournée, avec les consignes de la feuille de route', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const { fixture, element } = await boot();
    let printed: Element | null = null;
    print.mockImplementation(() => {
      printed = element.querySelector('[data-print-sheet]');
    });
    element.querySelector<HTMLButtonElement>('[data-round] [data-print] button')?.click();
    fixture.detectChanges();
    await settle(fixture);

    expect(print).toHaveBeenCalledTimes(1);
    expect(printed).not.toBeNull();
    expect(element.querySelector('[data-print-sheet]')).toBeNull();
  });

  it('affecte une commande à répartir à la tournée choisie, avec SA version, puis relit', async () => {
    const { fixture } = await boot();
    choose(fixture, '[data-unassigned] [data-assign]', 'r-2');
    await settle(fixture);

    expect(wire.calls).toEqual(['assign r-2 {"orderId":"o-3","version":7}']);
    expect(wire.reads.rounds).toHaveLength(2);
    expect(wire.reads.sheets).toHaveLength(2);
  });

  it('déplace un arrêt placé avec les versions des DEUX tournées, puis relit', async () => {
    const { fixture } = await boot();
    const stops = fixture.debugElement.queryAll(By.css('[data-round] [data-stop]'));
    stops[1]?.query(By.css('[data-move]')).triggerEventHandler('selectionChange', 'r-2');
    await settle(fixture);

    expect(wire.calls).toEqual(['move r-1 s-2 {"toRoundId":"r-2","fromVersion":4,"toVersion":7}']);
    expect(wire.reads.rounds).toHaveLength(2);
    expect(wire.reads.sheets).toHaveLength(2);
  });

  it('ne déplace rien quand on rechoisit la tournée de l’arrêt', async () => {
    const { fixture } = await boot();
    const stop = fixture.debugElement.query(By.css('[data-round] [data-stop]'));
    stop.query(By.css('[data-move]')).triggerEventHandler('selectionChange', 'r-1');
    await settle(fixture);
    expect(wire.calls).toEqual([]);
  });

  it('rouvre le jour de l’URL, et retombe sur demain si le paramètre est illisible', async () => {
    await boot(WRITE, undefined, { jour: '2026-10-24' });
    expect(wire.reads.rounds).toEqual(['2026-10-24']);

    await boot(WRITE, undefined, { jour: '2026-02-30' });
    expect(wire.reads.rounds).toEqual([shiftDay(parisDayOf(new Date()), 1)]);
  });

  it('écrit le jour choisi dans l’URL sans empiler l’historique', async () => {
    const { fixture } = await boot();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.debugElement
      .query(By.css('[data-day-bar] fold-date'))
      .triggerEventHandler('valueChange', '2026-10-24');
    await settle(fixture);

    expect(wire.reads.rounds.at(-1)).toBe('2026-10-24');
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { jour: '2026-10-24' }, replaceUrl: true }),
    );
  });
});
