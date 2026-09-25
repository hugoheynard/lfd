import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type { DaySupervisionView, LateOrder, StaffPermission } from '@lfd/contracts';

import { PermissionsStore } from '../../auth/permissions.store';
import { SupervisionService } from '../supervision.service';
import { SupervisionPage } from './supervision-page';

const LATE_PICKUP: LateOrder = {
  orderId: 'ord_pickup',
  reference: 'LFC-0001',
  customerName: 'Café du Port',
  fulfillmentMethod: 'pickup',
  window: { start: '07:00', end: '08:00', source: 'override' },
  stage: 'ready',
  rule: 'not_handed_over_after_window',
};

const LATE_DELIVERY: LateOrder = {
  orderId: 'ord_delivery',
  reference: 'LFC-0002',
  customerName: null,
  fulfillmentMethod: 'delivery',
  window: { start: '07:00', end: '09:00', source: 'override' },
  stage: 'in_production',
  rule: 'not_ready_before_window',
};

function viewOf(overrides: Partial<DaySupervisionView> = {}): DaySupervisionView {
  return {
    date: '2026-09-25',
    asOf: '2026-09-25T07:42:00.000Z',
    flow: [
      {
        fulfillmentMethod: 'pickup',
        placed: 1,
        inProduction: 2,
        ready: 3,
        handedOver: 4,
        cancelled: 1,
      },
      {
        fulfillmentMethod: 'delivery',
        placed: 0,
        inProduction: 1,
        ready: 0,
        handedOver: 2,
        cancelled: 0,
      },
    ],
    late: [LATE_PICKUP, LATE_DELIVERY],
    undated: 0,
    ...overrides,
  };
}

async function mount(
  day: () => Promise<DaySupervisionView>,
  permissions: readonly StaffPermission[] = ['b2b_supervision:read', 'b2b_orders:read'],
) {
  const granted = signal(permissions);
  TestBed.configureTestingModule({
    imports: [SupervisionPage],
    providers: [
      provideRouter([]),
      { provide: SupervisionService, useValue: { day } },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => granted().includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(SupervisionPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function root(fixture: { nativeElement: HTMLElement }): HTMLElement {
  return fixture.nativeElement;
}

function text(fixture: { nativeElement: HTMLElement }): string {
  return fixture.nativeElement.textContent ?? '';
}

function lateRows(fixture: { nativeElement: HTMLElement }): string[] {
  return Array.from(root(fixture).querySelectorAll<HTMLElement>('[data-order]')).map(
    (row) => row.dataset['order'] ?? '',
  );
}

describe('SupervisionPage', () => {
  it('montre le chargement tant que la journée n’est pas lue', async () => {
    const fixture = await mount(() => new Promise<DaySupervisionView>(() => undefined));

    expect(fixture.debugElement.query(By.css('fold-loading'))).not.toBeNull();
  });

  it('dit l’échec du chargement par un état fold, avec un bouton pour réessayer', async () => {
    const fixture = await mount(() => Promise.reject(new Error('503')));

    const state = fixture.debugElement.query(By.css('fold-empty-state'));
    expect(state.attributes['tone']).toBe('alert');
    expect(state.query(By.css('button'))).not.toBeNull();
  });

  it('compte chaque étape, et dit « Retirée » / « Livrée », jamais « remise »', async () => {
    const fixture = await mount(() => Promise.resolve(viewOf()));

    const pickup = root(fixture).querySelector<HTMLElement>('[data-stage="pickup:handed_over"]');
    const delivery = root(fixture).querySelector<HTMLElement>(
      '[data-stage="delivery:handed_over"]',
    );
    expect(pickup?.textContent).toContain('4');
    expect(pickup?.textContent).toContain('Retirée');
    expect(delivery?.textContent).toContain('Livrée');
    expect(text(fixture)).toContain('1 annulée');
    expect(text(fixture).toLowerCase()).not.toContain('remise');
  });

  it('écrit la règle de retard en clair', async () => {
    const fixture = await mount(() => Promise.resolve(viewOf()));

    expect(text(fixture)).toContain('Créneau 7 h–8 h dépassé, pas retirée');
    expect(text(fixture)).toContain('Pas prête, créneau à 7 h');
  });

  it('filtre la liste par l’étape cliquée, et la rend entière au second clic', async () => {
    const fixture = await mount(() => Promise.resolve(viewOf()));
    expect(lateRows(fixture)).toEqual(['ord_pickup', 'ord_delivery']);

    const stage = root(fixture).querySelector<HTMLButtonElement>(
      '[data-stage="delivery:in_production"]',
    );
    stage?.click();
    fixture.detectChanges();
    expect(lateRows(fixture)).toEqual(['ord_delivery']);

    stage?.click();
    fixture.detectChanges();
    expect(lateRows(fixture)).toEqual(['ord_pickup', 'ord_delivery']);
  });

  it('ouvre la commande par un lien à qui a b2b_orders:read', async () => {
    const fixture = await mount(() => Promise.resolve(viewOf()));

    const link = root(fixture).querySelector<HTMLAnchorElement>('[data-order="ord_pickup"] a');
    expect(link?.getAttribute('href')).toBe('/commandes/ord_pickup');
  });

  it('n’en fait pas un lien sans b2b_orders:read — pas de porte dérobée', async () => {
    const fixture = await mount(() => Promise.resolve(viewOf()), ['b2b_supervision:read']);

    const row = root(fixture).querySelector<HTMLElement>('[data-order="ord_pickup"]');
    expect(row?.querySelector('a')).toBeNull();
    expect(row?.textContent).toContain('LFC-0001');
  });

  it('signale les commandes ouvertes sans date, seulement s’il y en a', async () => {
    const without = await mount(() => Promise.resolve(viewOf()));
    expect(text(without)).not.toContain('sans date de service');

    TestBed.resetTestingModule();
    const withSome = await mount(() => Promise.resolve(viewOf({ undated: 3 })));
    expect(text(withSome)).toContain('3 commandes ouvertes sans date de service');
  });

  it('dit à quelle heure la vue a été lue, à Paris', async () => {
    const fixture = await mount(() => Promise.resolve(viewOf()));

    expect(text(fixture)).toContain('à jour à 9 h 42');
  });
});
