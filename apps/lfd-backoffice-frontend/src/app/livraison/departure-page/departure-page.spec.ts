import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import type {
  DeparturePayload,
  DeparturePointView,
  DepartureView,
  StaffPermission,
} from '@lfd/contracts';
import { FoldListboxComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { DeliveryRoutingService } from '../delivery-routing.service';
import { DoorstepSettingsService } from '../doorstep-settings.service';
import { DeliverySettingsService } from '../delivery-settings.service';
import { DeparturePage } from './departure-page';

function point(id: string, label: string, gps: DeparturePointView['gps']): DeparturePointView {
  return {
    pickupAddressId: id,
    label,
    address: {
      label,
      ligne1: '12 rue du Four',
      ligne2: '',
      codePostal: '75011',
      ville: 'Paris',
      pays: 'FR',
    },
    gps,
  };
}

const LABO = point('pa_1', 'Labo', { lat: 48.85, lng: 2.37 });
const BOUTIQUE = point('pa_2', 'Boutique', null);

interface Wire {
  view: DepartureView | null;
  writes: DeparturePayload[];
  refuse: string | null;
  said: string[];
}

let wire: Wire;

async function boot(
  view: DepartureView | null,
  grants: readonly StaffPermission[] = [
    'delivery_settings:read',
    'delivery_settings:write',
    'b2b_settings:read',
  ],
): Promise<ComponentFixture<DeparturePage>> {
  wire = { view, writes: [], refuse: null, said: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [DeparturePage],
    providers: [
      provideRouter([]),
      {
        provide: DeliverySettingsService,
        useValue: {
          departure: () =>
            wire.view === null
              ? Promise.reject(new Error('indisponible'))
              : Promise.resolve(wire.view),
          setDeparture: (payload: DeparturePayload) => {
            wire.writes.push(payload);
            return wire.refuse === null
              ? Promise.resolve()
              : Promise.reject(
                  new HttpErrorResponse({ status: 400, error: { message: wire.refuse } }),
                );
          },
        } satisfies Pick<DeliverySettingsService, 'departure' | 'setDeparture'>,
      },
      {
        provide: PermissionsStore,
        useValue: { can: (permission: StaffPermission) => grants.includes(permission) },
      },
      { provide: NotifyService, useValue: { success: (m: string) => wire.said.push(m) } },
      // Les réglages du calcul ont leur propre spec : ici, lus en échec, ils ne gênent rien.
      {
        provide: DeliveryRoutingService,
        useValue: { settings: () => Promise.reject(new Error('hors sujet')) },
      },
      // La décision à la porte aussi (B3 bis).
      {
        provide: DoorstepSettingsService,
        useValue: { settings: () => Promise.reject(new Error('hors sujet')) },
      },
    ],
  });
  const fixture = TestBed.createComponent(DeparturePage);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<DeparturePage>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

const host = (fixture: ComponentFixture<DeparturePage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const listbox = (fixture: ComponentFixture<DeparturePage>) =>
  fixture.debugElement.query(By.directive(FoldListboxComponent));

describe('DeparturePage', () => {
  it('dit « par défaut » tant que personne n’a choisi', async () => {
    const fixture = await boot({ source: 'default', point: LABO, choices: [LABO, BOUTIQUE] });
    const card = host(fixture).querySelector('[data-departure-point]')?.textContent ?? '';

    expect(card).toContain('Labo');
    expect(card).toContain('Par défaut');
    expect(card).toContain('12 rue du Four, 75011 Paris');
    expect(card).toContain('48.85, 2.37');
    expect(host(fixture).querySelector('[data-no-gps]')).toBeNull();
  });

  it('dit « choisi » quand le réglage est explicite', async () => {
    const fixture = await boot({ source: 'explicit', point: LABO, choices: [LABO] });
    expect(host(fixture).querySelector('[data-departure-point]')?.textContent).toContain(
      'Choisi dans les réglages',
    );
  });

  it('signale un point sans GPS, avec le lien vers son écran', async () => {
    const fixture = await boot({ source: 'explicit', point: BOUTIQUE, choices: [LABO, BOUTIQUE] });
    const warning = host(fixture).querySelector('[data-no-gps]');

    expect(warning?.textContent).toContain('aucune distance');
    expect(warning?.querySelector('a')?.getAttribute('href')).toBe(
      '/b2b/reglages/points-de-retrait/pa_2',
    );
  });

  it('sans accès aux points de retrait, signale sans offrir de lien', async () => {
    const fixture = await boot({ source: 'explicit', point: BOUTIQUE, choices: [BOUTIQUE] }, [
      'delivery_settings:read',
    ]);
    expect(host(fixture).querySelector('[data-no-gps]')).not.toBeNull();
    expect(host(fixture).querySelector('[data-no-gps] a')).toBeNull();
  });

  it('offre les points de retrait au choix, libellés, seulement avec l’écriture', async () => {
    const view: DepartureView = { source: 'default', point: LABO, choices: [LABO, BOUTIQUE] };
    const writer = await boot(view);
    const box = listbox(writer).componentInstance as FoldListboxComponent<string>;
    expect(box.options()?.map((option) => option.label)).toEqual(['Labo', 'Boutique']);
    expect(box.value()).toBe('pa_1');

    const reader = await boot(view, ['delivery_settings:read']);
    expect(listbox(reader)).toBeNull();
  });

  it('choisir un autre point écrit, annonce et relit', async () => {
    const fixture = await boot({ source: 'default', point: LABO, choices: [LABO, BOUTIQUE] });
    wire.view = { source: 'explicit', point: BOUTIQUE, choices: [LABO, BOUTIQUE] };
    listbox(fixture).triggerEventHandler('selectionChange', 'pa_2');
    await settle(fixture);
    await settle(fixture);

    expect(wire.writes).toEqual([{ pickupAddressId: 'pa_2' }]);
    expect(wire.said).toEqual(['Point de départ enregistré.']);
    expect(host(fixture).querySelector('[data-departure-point]')?.textContent).toContain(
      'Boutique',
    );
  });

  it('un refus s’affiche tel quel', async () => {
    const fixture = await boot({ source: 'default', point: LABO, choices: [LABO, BOUTIQUE] });
    wire.refuse = 'Ce point de retrait n’existe plus.';
    listbox(fixture).triggerEventHandler('selectionChange', 'pa_2');
    await settle(fixture);

    expect(host(fixture).querySelector('[data-refusal]')?.textContent).toContain('n’existe plus');
  });

  it('sans aucun point de retrait, le dit sans inventer d’adresse', async () => {
    const fixture = await boot({ source: 'default', point: null, choices: [] });
    expect(host(fixture).querySelector('[data-departure-empty]')).not.toBeNull();
  });

  it('dit l’échec de lecture', async () => {
    const fixture = await boot(null);
    expect(host(fixture).querySelector('[data-departure-error]')).not.toBeNull();
  });
});
