import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type {
  CollectionBatchView,
  CollectionCycleView,
  LegalEntityView,
  StaffPermission,
} from '@lfd/contracts';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { CollectionBatchesService } from '../collection-batches.service';
import { LegalEntitiesService } from '../legal-entities.service';
import { LotsDePrelevementPage } from './lots-de-prelevement-page';

/**
 * Ce que ces cas tiennent : les sociétés sans mandat sont nommées en tête et
 * le dépôt est désactivé (Q2) ; un lot déposé n'offre plus de geste ; une
 * exclusion dit sa raison ; un refus du serveur s'affiche avec ses mots.
 */

function batch(over: Partial<CollectionBatchView> = {}): CollectionBatchView {
  return {
    id: 'b1',
    scheme: 'B2B',
    cycleStartsAt: '2026-08-31T22:00:00.000Z',
    cycleClosesAt: '2026-09-30T22:00:00.000Z',
    status: 'constituted',
    constitutedAt: '2026-10-02T09:00:00.000Z',
    depositedAt: null,
    cancelledAt: null,
    lineCount: 2,
    orderCount: 5,
    totalCents: 123_400,
    unmandatedCompanies: [],
    depositable: true,
    ...over,
  };
}

class FakeApi {
  view: CollectionCycleView = { batches: [batch()], exclusions: [] };
  deposited: string[] = [];
  refuse: unknown = null;

  cycle(): Promise<CollectionCycleView> {
    return Promise.resolve(this.view);
  }
  deposit(id: string): Promise<void> {
    if (this.refuse !== null) {
      return Promise.reject(this.refuse);
    }
    this.deposited.push(id);
    return Promise.resolve();
  }
}

const ENTITY = { id: 'le1', name: 'La Folie Douce', archivedAt: null } as const;

async function render(
  api: FakeApi,
  permissions: readonly StaffPermission[] = ['b2b_accounting:read', 'b2b_accounting:write'],
): Promise<ComponentFixture<LotsDePrelevementPage>> {
  TestBed.configureTestingModule({
    imports: [LotsDePrelevementPage],
    providers: [
      { provide: CollectionBatchesService, useValue: api },
      {
        provide: LegalEntitiesService,
        useValue: {
          list: (): Promise<readonly Partial<LegalEntityView>[]> => Promise.resolve([ENTITY]),
        },
      },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(LotsDePrelevementPage);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<LotsDePrelevementPage>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

const text = (fixture: ComponentFixture<LotsDePrelevementPage>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

function button(
  fixture: ComponentFixture<LotsDePrelevementPage>,
  label: string,
): HTMLButtonElement | undefined {
  const all = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button');
  return Array.from(all).find((b) => b.textContent?.trim() === label);
}

describe('LotsDePrelevementPage', () => {
  it('rend le lot, son état et son montant', async () => {
    const body = text(await render(new FakeApi()));

    expect(body).toContain('Constitué — à déposer');
    expect(body).toMatch(/1\s?234,00\s€/u);
  });

  it('nomme en tête la société sans mandat, et ne propose pas le dépôt (Q2)', async () => {
    const api = new FakeApi();
    api.view = {
      batches: [batch({ depositable: false, unmandatedCompanies: ['Chalet Sans Mandat'] })],
      exclusions: [
        {
          orderId: 'o1',
          orderNumber: 'CMD-9',
          companyName: 'Chalet Sans Mandat',
          placedAt: '2026-09-20T09:00:00.000Z',
          amountCents: 1_000,
          reason: 'no_mandate',
        },
      ],
    };
    const fixture = await render(api);

    expect(text(fixture)).toContain('Non déposable — sans mandat prélevable');
    expect(text(fixture)).toContain('Sans mandat prélevable');
    expect(button(fixture, 'Marquer déposé')?.disabled).toBe(true);
  });

  it('un lot déposé n’offre plus de geste', async () => {
    const api = new FakeApi();
    api.view = { batches: [batch({ status: 'deposited' })], exclusions: [] };
    const fixture = await render(api);

    expect(button(fixture, 'Marquer déposé')).toBeUndefined();
    expect(button(fixture, 'Annuler')).toBeUndefined();
  });

  it('sans droit d’écriture, ni constituer ni déposer', async () => {
    const fixture = await render(new FakeApi(), ['b2b_accounting:read']);

    expect(button(fixture, 'Constituer le lot du dernier cycle clos')).toBeUndefined();
    expect(button(fixture, 'Marquer déposé')).toBeUndefined();
  });

  it('dépose le lot de la ligne', async () => {
    const api = new FakeApi();
    const fixture = await render(api);

    button(fixture, 'Marquer déposé')?.click();
    await settle(fixture);

    expect(api.deposited).toEqual(['b1']);
  });
});
