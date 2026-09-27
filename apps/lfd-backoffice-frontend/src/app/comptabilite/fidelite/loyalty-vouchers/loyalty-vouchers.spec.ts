import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import type { LoyaltyVoucherView, StaffPermission } from '@lfd/contracts';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { LoyaltyService } from '../../loyalty.service';
import { LoyaltyVouchers } from './loyalty-vouchers';

/**
 * Ce que ces cas tiennent : chaque bon montre son montant, son coût, son
 * ratio figé et son état ; seul un bon disponible s'annule ; le motif d'une
 * annulation reste lisible ; sans `b2b_accounting:write`, aucun geste.
 */

function voucher(over: Partial<LoyaltyVoucherView> = {}): LoyaltyVoucherView {
  return {
    id: 'v1',
    holder: { kind: 'user', id: 'u1', label: 'Camille Martin' },
    valueCents: 1_000,
    pointsCost: 2_000,
    ratio: { pointsPerStep: 1_000, stepValueCents: 500 },
    issuedAt: '2026-09-20T09:00:00.000Z',
    expiresAt: '2027-09-20T09:00:00.000Z',
    status: 'available',
    cancelledAt: null,
    cancellationReason: null,
    usedOn: null,
    ...over,
  };
}

const VOUCHERS: readonly LoyaltyVoucherView[] = [
  voucher(),
  voucher({ id: 'v2', status: 'expired' }),
  voucher({
    id: 'v3',
    status: 'cancelled',
    cancelledAt: '2026-09-21T09:00:00.000Z',
    cancellationReason: 'Émis par erreur',
  }),
  voucher({ id: 'v4', status: 'reserved', usedOn: { orderId: 'o9', orderNumber: 'ORD-9' } }),
];

class FakeApi {
  reads = 0;

  listVouchers(): Promise<readonly LoyaltyVoucherView[]> {
    this.reads += 1;
    return Promise.resolve(VOUCHERS);
  }
}

async function render(
  api: FakeApi,
  permissions: readonly StaffPermission[] = ['b2b_accounting:read', 'b2b_accounting:write'],
  opened: unknown[] = [],
): Promise<ComponentFixture<LoyaltyVouchers>> {
  TestBed.configureTestingModule({
    imports: [LoyaltyVouchers],
    providers: [
      provideRouter([]),
      { provide: LoyaltyService, useValue: api },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
      { provide: NotifyService, useValue: { success: () => undefined } },
      {
        provide: FoldPanelHostService,
        useValue: {
          open: (_c: unknown, config: { data: unknown }) => {
            opened.push(config.data);
            return { closed: Promise.resolve(true) };
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(LoyaltyVouchers);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<LoyaltyVouchers>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

const text = (fixture: ComponentFixture<LoyaltyVouchers>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

function buttons(fixture: ComponentFixture<LoyaltyVouchers>, label: string): HTMLButtonElement[] {
  const all = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button');
  return Array.from(all).filter((b) => b.textContent?.trim() === label);
}

describe('LoyaltyVouchers', () => {
  it('rend montant, coût, ratio figé, états et motif d’annulation', async () => {
    const body = text(await render(new FakeApi()));

    expect(body).toContain('Camille Martin');
    expect(body).toMatch(/10,00\s€/u);
    expect(body).toMatch(/2\s000 points/u);
    expect(body).toMatch(/1\s000 points = 5,00\s€/u);
    expect(body).toContain('Disponible');
    expect(body).toContain('Expiré');
    expect(body).toContain('Annulé');
    expect(body).toContain('Émis par erreur');
  });

  it('seul le bon disponible propose « Annuler », qui ouvre le panneau puis relit', async () => {
    const api = new FakeApi();
    const opened: unknown[] = [];
    const fixture = await render(api, undefined, opened);

    expect(buttons(fixture, 'Annuler')).toHaveLength(1);

    buttons(fixture, 'Annuler')[0]?.click();
    await settle(fixture);

    expect(opened).toEqual([VOUCHERS[0]]);
    expect(api.reads).toBe(2);
  });

  it('un bon engagé dit sur quelle commande, et ne propose pas « Annuler »', async () => {
    // Plan des points, §11 bis S6 et C9 : annuler un bon engagé est un geste
    // sur la commande, pas sur le bon.
    const fixture = await render(new FakeApi());
    const body = text(fixture);

    expect(body).toContain('Utilisé');
    expect(body).toContain('utilisé sur ORD-9');
    const link = (fixture.nativeElement as HTMLElement).querySelector('a[href="/commandes/o9"]');
    expect(link).not.toBeNull();
    expect(buttons(fixture, 'Annuler')).toHaveLength(1);
  });

  it('sans droit d’écriture, aucune annulation', async () => {
    const fixture = await render(new FakeApi(), ['b2b_accounting:read']);
    expect(buttons(fixture, 'Annuler')).toHaveLength(0);
  });
});
