import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { OpenOrderCutoffWaiverView, StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { OrderCutoffWaiversService } from '../../../commandes/order-cutoff-waivers.service';
import { NotifyService } from '../../../notify.service';
import { CutoffWaiversCard } from './cutoff-waivers-card';

/**
 * La liste des dérogations d'actualité (plan-reglages-commandes.md, O1c) :
 * servies ou non, retirables si elles n'ont pas servi et si l'on tient
 * `b2b_order_waivers:write`. Les dates ne sont comparées à aucune horloge ici :
 * le serveur filtre, l'écran affiche.
 */
const WAITING: OpenOrderCutoffWaiverView = {
  id: 'wvr_1',
  companyId: 'cmp_1',
  companyName: 'Boulangerie Martin',
  fulfillmentDate: '2026-03-02',
  reason: 'Client bloqué en tournée',
  grantedByStaffId: 'staff_1',
  grantedByName: 'Inès Martin',
  grantedAt: '2026-03-01T10:00:00.000Z',
  usedByOrderId: null,
};

const USED: OpenOrderCutoffWaiverView = {
  ...WAITING,
  id: 'wvr_2',
  grantedByName: null,
  usedByOrderId: 'ord_1',
};

class FakeWaivers {
  readonly revoked: string[] = [];

  constructor(private readonly list: readonly OpenOrderCutoffWaiverView[]) {}

  listOpen(): Promise<readonly OpenOrderCutoffWaiverView[]> {
    return Promise.resolve(this.list.filter((waiver) => !this.revoked.includes(waiver.id)));
  }

  revoke(id: string): Promise<void> {
    this.revoked.push(id);
    return Promise.resolve();
  }
}

async function mount(
  api: FakeWaivers,
  permissions: readonly StaffPermission[],
): Promise<ComponentFixture<CutoffWaiversCard>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CutoffWaiversCard],
    providers: [
      { provide: OrderCutoffWaiversService, useValue: api },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(CutoffWaiversCard);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const root = (fixture: ComponentFixture<CutoffWaiversCard>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('CutoffWaiversCard', () => {
  it('liste société, jour, motif et auteur — l’identifiant brut quand l’annuaire ne nomme plus', async () => {
    const fixture = await mount(new FakeWaivers([WAITING, USED]), ['b2b_order_waivers:read']);

    const text = root(fixture).textContent ?? '';
    expect(text).toContain('Boulangerie Martin');
    expect(text).toContain('2 mars 2026');
    expect(text).toContain('Client bloqué en tournée — Inès Martin');
    expect(text).toContain('— staff_1');
    expect(text).toContain('En attente');
    expect(text).toContain('Servie');
  });

  it('🔴 sans `b2b_order_waivers:write`, aucun retrait proposé', async () => {
    const fixture = await mount(new FakeWaivers([WAITING]), ['b2b_order_waivers:read']);

    expect(root(fixture).querySelector('button')).toBeNull();
  });

  it('ne propose le retrait que sur une dérogation qui n’a pas servi', async () => {
    const fixture = await mount(new FakeWaivers([WAITING, USED]), ['b2b_order_waivers:write']);

    expect(root(fixture).querySelector('[data-waiver="wvr_1"] button')).not.toBeNull();
    expect(root(fixture).querySelector('[data-waiver="wvr_2"] button')).toBeNull();
  });

  it('dit qu’aucune dérogation n’est à venir', async () => {
    const fixture = await mount(new FakeWaivers([]), ['b2b_order_waivers:read']);

    expect(root(fixture).textContent).toContain('Aucune dérogation à venir');
  });
});
