import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { DeliveryBagDetailView, StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { DeliveryLoadingService } from '../delivery-loading.service';
import { BagPage, situationOf } from './bag-page';

const WRITE: readonly StaffPermission[] = ['delivery_loading:read', 'delivery_loading:write'];

const ROUND = {
  roundId: 'r-1',
  day: '2026-10-01',
  vehicleName: 'Kangoo blanc',
  passage: 1,
  departedAt: null,
} as const;

function detail(overrides: Partial<DeliveryBagDetailView> = {}): DeliveryBagDetailView {
  return {
    bag: {
      bagId: 'b-2',
      code: 'ABC235',
      orderId: 'o-1',
      reference: 'CMD-1',
      customerLabel: 'Le Comptoir',
      index: 2,
      total: 3,
      voidedAt: null,
    },
    round: ROUND,
    loadedAt: null,
    ...overrides,
  };
}

interface Wire {
  readonly calls: string[];
  view: DeliveryBagDetailView;
  refuse: HttpErrorResponse | null;
}

let wire: Wire;

async function settle(fixture: ComponentFixture<BagPage>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

async function boot(
  grants: readonly StaffPermission[] = WRITE,
  view: DeliveryBagDetailView = detail(),
): Promise<{ fixture: ComponentFixture<BagPage>; element: HTMLElement }> {
  wire = { calls: [], view, refuse: null };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: DeliveryLoadingService,
        useValue: {
          bag: (bagId: string) => {
            wire.calls.push(`read ${bagId}`);
            return Promise.resolve(wire.view);
          },
          load: (roundId: string, payload: unknown) => {
            wire.calls.push(`load ${roundId} ${JSON.stringify(payload)}`);
            return wire.refuse === null ? Promise.resolve() : Promise.reject(wire.refuse);
          },
          voidBag: (bagId: string) => {
            wire.calls.push(`void ${bagId}`);
            return Promise.resolve();
          },
        } satisfies Partial<Record<keyof DeliveryLoadingService, unknown>>,
      },
      {
        provide: PermissionsStore,
        useValue: { can: (permission: StaffPermission) => grants.includes(permission) },
      },
    ],
  });
  const fixture = TestBed.createComponent(BagPage);
  fixture.componentRef.setInput('bagId', 'b-2');
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('BagPage', () => {
  it('🔴 ouvrir ne fait que LIRE : aucune écriture tant qu’on ne clique pas', async () => {
    const { element } = await boot();
    expect(wire.calls).toEqual(['read b-2']);
    expect(element.querySelector('[data-bag]')?.textContent).toContain('sac 2 / 3');
    expect(element.querySelector('[data-load]')?.textContent).toContain(
      'Charger dans Kangoo blanc',
    );
  });

  it('charge sur le geste, puis relit', async () => {
    const { fixture, element } = await boot();
    element.querySelector<HTMLButtonElement>('button[data-load]')?.click();
    await settle(fixture);
    expect(wire.calls).toEqual(['read b-2', 'load r-1 {"bagId":"b-2"}', 'read b-2']);
  });

  it('dit le refus du serveur tel quel', async () => {
    const { fixture, element } = await boot();
    wire.refuse = new HttpErrorResponse({
      status: 409,
      error: { message: 'Ce sac part dans le Master bleu.' },
    });
    element.querySelector<HTMLButtonElement>('button[data-load]')?.click();
    await settle(fixture);
    expect(element.querySelector('[data-refusal]')?.textContent?.trim()).toBe(
      'Ce sac part dans le Master bleu.',
    );
  });

  it('« à répartir d’abord » quand la commande n’est dans aucune tournée', async () => {
    const { element } = await boot(WRITE, detail({ round: null }));
    expect(element.querySelector('[data-unassigned]')?.textContent).toContain('À répartir d’abord');
    expect(element.querySelector('[data-load]')).toBeNull();
  });

  it('une tournée partie : lecture seule', async () => {
    const { element } = await boot(
      WRITE,
      detail({ round: { ...ROUND, departedAt: '2026-10-01T05:42:00.000Z' } }),
    );
    expect(element.querySelector('[data-departed]')).not.toBeNull();
    expect(element.querySelector('[data-load]')).toBeNull();
    expect(element.querySelector('[data-void]')).toBeNull();
  });

  it('sans écriture, ni charger ni annuler', async () => {
    const { element } = await boot(['delivery_loading:read']);
    expect(element.querySelector('[data-load]')).toBeNull();
    expect(element.querySelector('[data-read-only]')).not.toBeNull();
    expect(element.querySelector('[data-void]')).toBeNull();
  });
});

describe('situationOf', () => {
  it('lit l’annulation avant tout, le départ avant le chargement', () => {
    const view = detail();
    expect(situationOf(detail({ bag: { ...view.bag, voidedAt: 'x', index: null } }))).toBe(
      'voided',
    );
    expect(situationOf(detail({ round: null }))).toBe('unassigned');
    expect(situationOf(detail({ round: { ...ROUND, departedAt: 'x' }, loadedAt: 'y' }))).toBe(
      'departed',
    );
    expect(situationOf(detail({ loadedAt: 'y' }))).toBe('loaded');
    expect(situationOf(view)).toBe('loadable');
  });
});
