import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import type {
  DeliveryLoadingPlanView,
  DeliveryLoadingRoundView,
  LoadDeliveryBinPayload,
  StaffPermission,
} from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { BinScanner } from '../bin-scanner/bin-scanner';
import { DeliveryLoadingService } from '../delivery-loading.service';
import { MyDeliveryLoadingService } from '../my-delivery-loading.service';
import { MyRoundLoading } from './my-round-loading';

/** Tout chargé : la seconde moitié du jeu est déjà dans le véhicule. */
let allLoaded = false;

function view(): DeliveryLoadingRoundView {
  return {
    roundId: 'r-1',
    day: '2026-10-01',
    vehicleName: 'Kangoo',
    passage: 1,
    version: 2,
    departedAt: null,
    stops: [
      {
        stopId: 's-1',
        orderId: 'o-1',
        reference: 'CMD-1',
        customerLabel: 'Le Comptoir',
        position: 1,
        state: 'partial',
        bins: [
          {
            binId: 'b-1',
            code: 'ABC234',
            index: 1,
            binTypeName: 'Bac M',
            half: null,
            innerBags: 0,
            sharedWithReference: null,
            toRedo: false,
            loadedAt: '2026-10-01T05:00:00.000Z',
          },
          {
            binId: 'b-2',
            code: 'ABC235',
            index: 2,
            binTypeName: 'Bac M',
            half: null,
            innerBags: 0,
            sharedWithReference: null,
            toRedo: false,
            loadedAt: allLoaded ? '2026-10-01T05:01:00.000Z' : null,
          },
        ],
      },
    ],
  };
}

function planBin(binId: string, code: string) {
  return {
    binId,
    code,
    reference: 'CMD-1',
    binTypeName: 'Bac M',
    half: null,
    sharedWithReference: null,
    isotherm: false,
    stackIndex: 1,
  };
}

// Sans plancher : les piles se montrent quand même, et la tuile chargée se décharge.
const PLAN: DeliveryLoadingPlanView = {
  roundId: 'r-1',
  vehicleName: 'Kangoo',
  order: [
    {
      step: 1,
      stopPosition: 1,
      reference: 'CMD-1',
      customerLabel: 'Le Comptoir',
      bins: [planBin('b-1', 'ABC234'), planBin('b-2', 'ABC235')],
    },
  ],
  stacks: [
    {
      stackIndex: 1,
      binTypeName: 'Bac M',
      height: 2,
      maxStack: 5,
      stopPositions: [1],
      placement: null,
    },
  ],
  floor: null,
  volume: {
    dryLiters: 0,
    coldLiters: 0,
    dryCapacityLiters: null,
    coldCapacityLiters: null,
    dryOver: false,
    coldOver: false,
  },
  warnings: [],
};

interface Wire {
  readonly calls: string[];
  refuse: HttpErrorResponse | null;
}

let wire: Wire;

function outcome(call: string): Promise<void> {
  wire.calls.push(call);
  return wire.refuse === null ? Promise.resolve() : Promise.reject(wire.refuse);
}

async function settle(fixture: ComponentFixture<MyRoundLoading>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

async function boot(
  grants: readonly StaffPermission[],
): Promise<{ fixture: ComponentFixture<MyRoundLoading>; element: HTMLElement }> {
  wire = { calls: [], refuse: null };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: MyDeliveryLoadingService,
        useValue: {
          round: (roundId: string) => {
            wire.calls.push(`round ${roundId}`);
            return Promise.resolve(view());
          },
          plan: () => Promise.resolve(PLAN),
          load: (roundId: string, payload: LoadDeliveryBinPayload) =>
            outcome(`load ${roundId} ${JSON.stringify(payload)}`),
          unload: (roundId: string, binId: string) => outcome(`unload ${roundId} ${binId}`),
        } satisfies Partial<Record<keyof MyDeliveryLoadingService, unknown>>,
      },
      // La porte du dépôt ne doit JAMAIS être appelée d'ici : elle échoue bruyamment.
      { provide: DeliveryLoadingService, useValue: {} },
      {
        provide: PermissionsStore,
        useValue: { can: (permission: StaffPermission) => grants.includes(permission) },
      },
    ],
  });
  const fixture = TestBed.createComponent(MyRoundLoading);
  fixture.componentRef.setInput('roundId', 'r-1');
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('MyRoundLoading — charger SA tournée', () => {
  it('lit le chargement par la porte du livreur, et ne propose pas « Partir »', async () => {
    const { element } = await boot(['delivery_driving:read', 'delivery_driving:write']);
    expect(wire.calls).toEqual(['round r-1']);
    expect(element.querySelector('[data-loading-title]')?.textContent).toContain(
      'Charger · Kangoo',
    );
    expect(element.querySelector('[data-scan]')).not.toBeNull();
    expect(element.querySelector('[data-depart]')).toBeNull();
  });

  it('un scan charge par sa route, puis relit', async () => {
    const { fixture, element } = await boot(['delivery_driving:read', 'delivery_driving:write']);
    fixture.debugElement.query(By.directive(BinScanner)).triggerEventHandler('scanned', 'ABC235');
    await settle(fixture);
    expect(wire.calls.slice(-2)).toEqual(['load r-1 {"code":"ABC235"}', 'round r-1']);
    expect(element.querySelector('[data-notice]')?.textContent).toContain('chargé');
  });

  it('décharge par sa route, et dit le refus du serveur tel quel', async () => {
    const { fixture, element } = await boot(['delivery_driving:read', 'delivery_driving:write']);
    const message = 'Ce bac est chargé dans le Master — il n’est pas à vous.';
    wire.refuse = new HttpErrorResponse({ status: 409, error: { message } });
    const loaded = element.querySelector<HTMLButtonElement>('[data-row-tile][data-state="loaded"]');
    expect(loaded?.getAttribute('aria-label')).toContain('toucher pour le décharger');
    loaded?.click();
    fixture.detectChanges();
    expect(element.querySelector('[data-unload]')?.textContent).toContain('Décharger ABC234');
    element.querySelector<HTMLButtonElement>('button[data-unload]')?.click();
    await settle(fixture);
    expect(wire.calls).toContain('unload r-1 b-1');
    expect(element.querySelector('[data-notice-text]')?.textContent?.trim()).toBe(message);
  });

  it('sans le droit d’écrire, lit seulement : ni scan, ni déchargement', async () => {
    const { fixture, element } = await boot(['delivery_driving:read']);
    expect(element.querySelector('[data-scan]')).toBeNull();
    element.querySelector<HTMLButtonElement>('[data-row-tile][data-state="loaded"]')?.click();
    fixture.detectChanges();
    expect(element.querySelector('[data-unload]')).toBeNull();
  });

  it('« Ma tournée » est un lien de retour vers la page du livreur', async () => {
    const { element } = await boot(['delivery_driving:read']);
    const back = element.querySelector('fold-back-link[data-close-loading] a');
    expect(back?.getAttribute('href')).toBe('/livraison/ma-tournee');
    expect(back?.textContent).toContain('Ma tournée');
    expect(element.querySelector('h1')).toBeNull();
  });

  it('« Retour à ma tournée », tout chargé, revient par le routeur', async () => {
    allLoaded = true;
    const { fixture, element } = await boot(['delivery_driving:read', 'delivery_driving:write']);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    element.querySelector<HTMLButtonElement>('[data-done]')?.click();
    fixture.detectChanges();
    expect(navigate).toHaveBeenCalledWith('/livraison/ma-tournee');
    allLoaded = false;
  });
});
