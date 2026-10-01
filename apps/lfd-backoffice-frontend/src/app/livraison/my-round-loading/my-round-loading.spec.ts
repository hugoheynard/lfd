import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type {
  DeliveryLoadingRoundView,
  LoadDeliveryBinPayload,
  StaffPermission,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { BinScanner } from '../bin-scanner/bin-scanner';
import { DeliveryLoadingService } from '../delivery-loading.service';
import { MyDeliveryLoadingService } from '../my-delivery-loading.service';
import { MyRoundLoading } from './my-round-loading';

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
        ],
      },
    ],
  };
}

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
      {
        provide: MyDeliveryLoadingService,
        useValue: {
          round: (roundId: string) => {
            wire.calls.push(`round ${roundId}`);
            return Promise.resolve(view());
          },
          plan: () => Promise.reject(new Error('plan hors sujet ici')),
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
    expect(element.querySelectorAll('[data-stop]')).toHaveLength(1);
    expect(element.querySelector('[data-scan]')).not.toBeNull();
    expect(element.querySelector('[data-depart]')).toBeNull();
  });

  it('un scan charge par sa route, puis relit', async () => {
    const { fixture, element } = await boot(['delivery_driving:read', 'delivery_driving:write']);
    fixture.debugElement.query(By.directive(BinScanner)).triggerEventHandler('scanned', 'ABC234');
    await settle(fixture);
    expect(wire.calls.slice(-2)).toEqual(['load r-1 {"code":"ABC234"}', 'round r-1']);
    expect(element.querySelector('[data-notice]')?.textContent).toContain('chargé');
  });

  it('décharge par sa route, et dit le refus du serveur tel quel', async () => {
    const { fixture, element } = await boot(['delivery_driving:read', 'delivery_driving:write']);
    const message = 'Ce bac est chargé dans le Master — il n’est pas à vous.';
    wire.refuse = new HttpErrorResponse({ status: 409, error: { message } });
    element.querySelector<HTMLButtonElement>('button[data-unload]')?.click();
    await settle(fixture);
    expect(wire.calls).toContain('unload r-1 b-1');
    expect(element.querySelector('[data-notice]')?.textContent?.trim()).toBe(message);
  });

  it('sans le droit d’écrire, lit seulement : ni scan, ni déchargement', async () => {
    const { element } = await boot(['delivery_driving:read']);
    expect(element.querySelectorAll('[data-stop]')).toHaveLength(1);
    expect(element.querySelector('[data-scan]')).toBeNull();
    expect(element.querySelector('[data-unload]')).toBeNull();
  });

  it('« Retour à ma tournée » le dit à la page', async () => {
    const { fixture, element } = await boot(['delivery_driving:read']);
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => (closed += 1));
    element.querySelector<HTMLButtonElement>('[data-close-loading]')?.click();
    expect(closed).toBe(1);
  });
});
