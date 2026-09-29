import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import type {
  DeliveryLoadingRoundView,
  LoadDeliveryBagPayload,
  StaffPermission,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { BagScanner } from '../bag-scanner/bag-scanner';
import { DeliveryLoadingService } from '../delivery-loading.service';
import { LoadingRoundPage, loadedNotice } from './loading-round-page';

const WRITE: readonly StaffPermission[] = ['delivery_loading:read', 'delivery_loading:write'];

function round(overrides: Partial<DeliveryLoadingRoundView> = {}): DeliveryLoadingRoundView {
  return {
    roundId: 'r-1',
    day: '2026-10-01',
    vehicleName: 'Kangoo',
    passage: 1,
    version: 5,
    departedAt: null,
    stops: [
      {
        stopId: 's-1',
        orderId: 'o-1',
        reference: 'CMD-1',
        customerLabel: 'Le Comptoir',
        position: 1,
        state: 'partial',
        bags: [
          { bagId: 'b-1', code: 'ABC234', index: 1, loadedAt: '2026-10-01T05:00:00.000Z' },
          { bagId: 'b-2', code: 'ABC235', index: 2, loadedAt: null },
        ],
      },
      {
        stopId: 's-2',
        orderId: 'o-2',
        reference: 'CMD-2',
        customerLabel: 'Chez Paul',
        position: 2,
        state: 'unlabelled',
        bags: [],
      },
    ],
    ...overrides,
  };
}

interface Wire {
  readonly calls: string[];
  view: DeliveryLoadingRoundView;
  refuse: HttpErrorResponse | null;
}

let wire: Wire;

function outcome(call: string): Promise<void> {
  wire.calls.push(call);
  return wire.refuse === null ? Promise.resolve() : Promise.reject(wire.refuse);
}

async function settle(fixture: ComponentFixture<LoadingRoundPage>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

async function boot(
  grants: readonly StaffPermission[] = WRITE,
  view: DeliveryLoadingRoundView = round(),
): Promise<{ fixture: ComponentFixture<LoadingRoundPage>; element: HTMLElement }> {
  wire = { calls: [], view, refuse: null };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: DeliveryLoadingService,
        useValue: {
          round: () => Promise.resolve(wire.view),
          load: (roundId: string, payload: LoadDeliveryBagPayload) =>
            outcome(`load ${roundId} ${JSON.stringify(payload)}`),
          unload: (roundId: string, bagId: string) => outcome(`unload ${roundId} ${bagId}`),
          depart: (roundId: string, version: number) =>
            outcome(`depart ${roundId} ${String(version)}`),
        } satisfies Partial<Record<keyof DeliveryLoadingService, unknown>>,
      },
      {
        provide: PermissionsStore,
        useValue: { can: (permission: StaffPermission) => grants.includes(permission) },
      },
    ],
  });
  const fixture = TestBed.createComponent(LoadingRoundPage);
  fixture.componentRef.setInput('roundId', 'r-1');
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

function scan(fixture: ComponentFixture<LoadingRoundPage>, raw: string): void {
  fixture.debugElement.query(By.directive(BagScanner)).triggerEventHandler('scanned', raw);
}

describe('LoadingRoundPage', () => {
  it('dit « 1 sac sur 2 » par arrêt, met l’arrêt sans sac en rouge, et liste ce qui manque', async () => {
    const { element } = await boot();
    const stops = [...element.querySelectorAll('[data-stop]')];
    expect(stops[0]?.textContent).toContain('1 sac sur 2');
    expect(stops[1]?.textContent).toContain('Aucun sac déclaré');
    const missing = [...element.querySelectorAll('[data-missing-stop]')].map((line) =>
      line.textContent?.trim(),
    );
    expect(missing).toEqual([
      'CMD-1 · Le Comptoir — 1 sac sur 2',
      'CMD-2 · Chez Paul — aucun sac déclaré',
    ]);
  });

  it('charge un sac scanné par son identifiant — le scan est le geste', async () => {
    const { fixture, element } = await boot();
    scan(fixture, 'https://bo.example/livraison/sac/b-2');
    await settle(fixture);
    expect(wire.calls).toEqual(['load r-1 {"bagId":"b-2"}']);
    expect(element.querySelector('[data-notice]')?.textContent).toContain(
      'CMD-1 · Le Comptoir — sac 2 chargé',
    );
  });

  it('🔴 n’envoie rien pour un code qui n’est pas un sac', async () => {
    const { fixture, element } = await boot();
    scan(fixture, 'https://bo.example/colisage/CMD-1');
    await settle(fixture);
    expect(wire.calls).toEqual([]);
    expect(element.querySelector('[data-notice]')?.textContent).toContain('ne désigne pas un sac');
  });

  it('affiche le refus du serveur tel quel — un sac d’une autre tournée nomme le véhicule', async () => {
    const { fixture, element } = await boot();
    wire.refuse = new HttpErrorResponse({
      status: 409,
      error: { message: 'Ce sac part dans le Master bleu.' },
    });
    scan(fixture, 'abc 236');
    await settle(fixture);
    expect(wire.calls).toEqual(['load r-1 {"code":"ABC236"}']);
    expect(element.querySelector('[data-notice]')?.textContent?.trim()).toBe(
      'Ce sac part dans le Master bleu.',
    );
  });

  it('décharge un sac chargé', async () => {
    const { fixture, element } = await boot();
    element.querySelector<HTMLButtonElement>('button[data-unload]')?.click();
    await settle(fixture);
    expect(wire.calls).toEqual(['unload r-1 b-1']);
  });

  it('part avec la version lue, et dit le refus qui liste les références', async () => {
    const { fixture, element } = await boot();
    wire.refuse = new HttpErrorResponse({
      status: 409,
      error: { message: 'Non chargés : CMD-1, CMD-2.' },
    });
    element.querySelector<HTMLButtonElement>('button[data-depart]')?.click();
    await settle(fixture);
    expect(wire.calls).toEqual(['depart r-1 5']);
    expect(element.querySelector('[data-notice]')?.textContent).toContain('CMD-1, CMD-2');
  });

  it('une tournée partie est en lecture seule : ni scanner, ni décharger, ni partir', async () => {
    const { element } = await boot(WRITE, round({ departedAt: '2026-10-01T05:42:00.000Z' }));
    expect(element.querySelector('[data-departed]')?.textContent).toContain('7 h 42');
    expect(element.querySelector('[data-scan]')).toBeNull();
    expect(element.querySelector('[data-unload]')).toBeNull();
    expect(element.querySelector('[data-depart]')).toBeNull();
  });

  it('sans écriture, on lit le chargement sans aucun geste', async () => {
    const { element } = await boot(['delivery_loading:read']);
    expect(element.querySelectorAll('[data-stop]')).toHaveLength(2);
    expect(element.querySelector('[data-scan]')).toBeNull();
    expect(element.querySelector('[data-depart]')).toBeNull();
  });
});

describe('loadedNotice', () => {
  it('nomme la commande et le rang du sac chargé', () => {
    expect(loadedNotice(round(), { code: 'ABC235' })).toBe(
      'CMD-1 · Le Comptoir — sac 2 chargé (1 sac sur 2).',
    );
  });
});
