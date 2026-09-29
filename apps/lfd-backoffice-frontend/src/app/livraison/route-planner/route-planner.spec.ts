import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import type {
  ApplyDeliveryProposalPayload,
  DeliveryRoundProposalView,
  DeliveryRoutingSettingsView,
} from '@lfd/contracts';
import { FoldCheckboxComponent, FoldListboxComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../notify.service';
import { type ProposalRequest, DeliveryRoutingService } from '../delivery-routing.service';
import { RoutePlanner } from './route-planner';

const SETTINGS: DeliveryRoutingSettingsView = {
  detourPercent: 140,
  averageSpeedKmh: 35,
  earliestDeparture: '07:00',
  maxRoundMinutes: 240,
  stopMinutes: 5,
  defaultMode: 'insert',
  multiplePassages: true,
  source: 'default',
};

const PROPOSAL: DeliveryRoundProposalView = {
  day: '2026-10-01',
  estimate: 'crow_flies',
  mode: 'insert',
  departurePoint: { pickupAddressId: 'p-1', label: 'Labo', gps: { lat: 45.5, lng: 6.4 } },
  settings: SETTINGS,
  rounds: [
    {
      roundId: 'r-1',
      vehicleId: 'v-1',
      vehicleName: 'Kangoo',
      passage: 1,
      departureTime: '07:00',
      returnTime: '09:10',
      meters: 42_000,
      minutes: 130,
      overDuration: true,
      stops: [
        {
          orderId: 'o-2',
          reference: 'CMD-2',
          arrival: '07:20',
          window: { start: '08:00', end: '09:00' },
          windowMissed: false,
        },
        { orderId: 'o-1', reference: 'CMD-1', arrival: '09:40', window: null, windowMissed: true },
      ],
    },
  ],
  unlocated: [
    { orderId: 'o-5', reference: 'CMD-5', reason: 'not_geocoded' },
    { orderId: 'o-6', reference: 'CMD-6', reason: 'no_address' },
  ],
  overflow: [{ orderId: 'o-7', reference: 'CMD-7' }],
  kept: [{ roundId: 'r-8', vehicleName: 'Trafic', passage: 2, reason: 'departed' }],
  versions: [
    { roundId: 'r-1', version: 4 },
    { roundId: 'r-8', version: 9 },
  ],
};

interface Wire {
  proposals: ProposalRequest[];
  writes: string[];
  applied: ApplyDeliveryProposalPayload[];
  refuse: HttpErrorResponse | null;
  changed: number;
}

let wire: Wire;

function refusedOr(): Promise<void> {
  return wire.refuse === null ? Promise.resolve() : Promise.reject(wire.refuse);
}

async function boot(canWrite = true): Promise<ComponentFixture<RoutePlanner>> {
  wire = { proposals: [], writes: [], applied: [], refuse: null, changed: 0 };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [RoutePlanner],
    providers: [
      provideRouter([]),
      {
        provide: DeliveryRoutingService,
        useValue: {
          locate: (day: string) => {
            wire.writes.push(`locate ${day}`);
            return refusedOr();
          },
          propose: (request: ProposalRequest) => {
            wire.proposals.push(request);
            return Promise.resolve(PROPOSAL);
          },
          apply: (payload: ApplyDeliveryProposalPayload) => {
            wire.writes.push('apply');
            wire.applied.push(payload);
            return refusedOr();
          },
          settings: () => Promise.resolve(SETTINGS),
        } satisfies Partial<Record<keyof DeliveryRoutingService, unknown>>,
      },
      { provide: NotifyService, useValue: { success: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(RoutePlanner);
  fixture.componentRef.setInput('day', '2026-10-01');
  fixture.componentRef.setInput('vehicles', [
    { value: 'v-1', label: 'Kangoo' },
    { value: 'v-2', label: 'Trafic' },
  ]);
  fixture.componentRef.setInput('canWrite', canWrite);
  fixture.componentRef.setInput('canReadSettings', true);
  fixture.componentRef.setInput('companies', new Map([['o-5', 'co-1']]));
  fixture.componentRef.setInput('canOpenClients', true);
  fixture.componentInstance.changed.subscribe(() => {
    wire.changed += 1;
  });
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<RoutePlanner>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

const host = (fixture: ComponentFixture<RoutePlanner>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

async function click(fixture: ComponentFixture<RoutePlanner>, selector: string): Promise<void> {
  const button = host(fixture).querySelector<HTMLButtonElement>(`button${selector}`);
  if (button === null) {
    throw new Error(`bouton introuvable : ${selector}`);
  }
  button.click();
  await settle(fixture);
}

describe('RoutePlanner', () => {
  it('propose sans rien écrire : véhicules du jour, compléter, mode des réglages', async () => {
    const fixture = await boot();
    await click(fixture, '[data-propose]');

    expect(wire.proposals).toEqual([
      { day: '2026-10-01', vehicleIds: ['v-1', 'v-2'], recomposeAll: false, mode: 'insert' },
    ]);
    expect(wire.writes).toEqual([]);
    expect(wire.changed).toBe(0);
  });

  it('montre la proposition en aperçu : durées, dépassement, fenêtre manquée, vol d’oiseau', async () => {
    const fixture = await boot();
    await click(fixture, '[data-propose]');
    const element = host(fixture);
    const round = element.querySelector('[data-proposed-round]')?.textContent ?? '';

    expect(element.querySelector('[data-crow-flies]')?.textContent).toContain(
      'Estimation à vol d’oiseau (×1,4, 35 km/h)',
    );
    expect(round).toContain('Départ 7 h 00 · retour 9 h 10 · 42,0 km · 2 h 10');
    expect(round).toContain('CMD-2 · arrivée vers 7 h 20');
    expect(round).toContain('fenêtre 8 h 00 – 9 h 00');
    expect(element.querySelector('[data-over-duration]')).not.toBeNull();
    expect(element.querySelectorAll('[data-window-missed]')).toHaveLength(1);
    expect(element.querySelector('[data-overflow]')?.textContent).toContain('CMD-7');
    expect(element.querySelector('[data-kept]')?.textContent).toContain(
      'Trafic · passage 2 · Déjà partie',
    );
  });

  it('dit les non situées, leur raison, et où compléter leur point', async () => {
    const fixture = await boot();
    await click(fixture, '[data-propose]');
    const lines = host(fixture).querySelectorAll('[data-unlocated-order]');

    expect(lines[0]?.textContent).toContain('CMD-5 · Adresse pas encore située');
    expect(lines[0]?.querySelector('[data-locate-again]')).not.toBeNull();
    expect(lines[0]?.querySelector('[data-company-link]')?.getAttribute('href')).toBe(
      '/comptes-clients/co-1/informations',
    );
    // Sans société connue : la commande elle-même.
    expect(lines[1]?.textContent).toContain('CMD-6 · Aucune adresse lisible sur la commande');
    expect(lines[1]?.querySelector('[data-order-link]')?.getAttribute('href')).toBe(
      '/commandes/o-6',
    );
  });

  it('n’envoie que les véhicules cochés, et le mode choisi', async () => {
    const fixture = await boot();
    fixture.debugElement
      .queryAll(By.directive(FoldCheckboxComponent))[0]
      ?.triggerEventHandler('checkedChange', false);
    const mode = fixture.debugElement.query(By.css('[data-mode]'));
    expect(mode.componentInstance).toBeInstanceOf(FoldListboxComponent);
    mode.triggerEventHandler('valueChange', 'new_rounds');
    await settle(fixture);
    await click(fixture, '[data-propose]');

    expect(wire.proposals[0]).toMatchObject({ vehicleIds: ['v-2'], mode: 'new_rounds' });
  });

  it('applique la proposition vue, avec toutes les versions lues, puis fait relire', async () => {
    const fixture = await boot();
    await click(fixture, '[data-propose]');
    await click(fixture, '[data-apply]');

    expect(wire.applied).toEqual([
      {
        day: '2026-10-01',
        rounds: [{ roundId: 'r-1', vehicleId: 'v-1', orderIds: ['o-2', 'o-1'] }],
        versions: [
          { roundId: 'r-1', version: 4 },
          { roundId: 'r-8', version: 9 },
        ],
      },
    ]);
    expect(wire.changed).toBe(1);
    expect(host(fixture).querySelector('[data-proposal]')).toBeNull();
  });

  it('affiche le refus « reproposez » tel quel, jette la proposition et fait relire', async () => {
    const fixture = await boot();
    await click(fixture, '[data-propose]');
    wire.refuse = new HttpErrorResponse({
      status: 409,
      error: { message: 'La composition a changé : reproposez.' },
    });
    await click(fixture, '[data-apply]');

    expect(host(fixture).querySelector('[data-planner-refusal]')?.textContent).toContain(
      'La composition a changé : reproposez.',
    );
    expect(host(fixture).querySelector('[data-proposal]')).toBeNull();
    expect(wire.changed).toBe(1);
  });

  it('jeter efface l’aperçu sans rien écrire', async () => {
    const fixture = await boot();
    await click(fixture, '[data-propose]');
    await click(fixture, '[data-discard]');

    expect(host(fixture).querySelector('[data-proposal]')).toBeNull();
    expect(wire.writes).toEqual([]);
  });

  it('situe les arrêts du jour, comme un geste', async () => {
    const fixture = await boot();
    await click(fixture, '[data-locate]');

    expect(wire.writes).toEqual(['locate 2026-10-01']);
  });

  it('sans droit d’écriture : proposer oui, situer et appliquer non', async () => {
    const fixture = await boot(false);
    await click(fixture, '[data-propose]');
    const element = host(fixture);

    expect(element.querySelector('[data-proposal]')).not.toBeNull();
    expect(element.querySelector('[data-locate]')).toBeNull();
    expect(element.querySelector('[data-apply]')).toBeNull();
    expect(element.querySelector('[data-locate-again]')).toBeNull();
  });
});
