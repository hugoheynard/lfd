import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AdminOrdersQuery, CustomerSheetView, StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { CustomerSheetService } from '../../commercial/calendrier/customer-sheet/customer-sheet.service';
import { AdminOrdersService } from '../../commandes/orders.service';
import { ClientCommandesPage } from './commandes-page';

/**
 * Écart 1 de `droits-des-commandes.md` (corrigé le 2026-10-12) : la saisie
 * exige `b2b_place_order:write`, et qui lit les comptes sans passer de commande
 * voyait un lien que la garde de route refusait au clic.
 */
async function mount(
  permissions: readonly StaffPermission[],
  queries: Partial<AdminOrdersQuery>[] = [],
): Promise<ComponentFixture<ClientCommandesPage>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ClientCommandesPage],
    providers: [
      provideRouter([]),
      {
        provide: AdminOrdersService,
        useValue: {
          list: (query: Partial<AdminOrdersQuery>) => {
            queries.push(query);
            return Promise.resolve({ rows: [] });
          },
        },
      },
      {
        provide: CustomerSheetService,
        useValue: {
          sheet: (): Promise<CustomerSheetView> =>
            Promise.resolve({ stats: { recurringBasketsCount: 0 } } as CustomerSheetView),
        },
      },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(ClientCommandesPage);
  fixture.componentRef.setInput('id', 'co_1');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const link = (fixture: ComponentFixture<ClientCommandesPage>): Element | null =>
  (fixture.nativeElement as HTMLElement).querySelector('[data-place-order]');

describe('ClientCommandesPage — passer une commande', () => {
  it('propose la saisie avec `b2b_place_order:write`', async () => {
    const fixture = await mount(['b2b_companies:read', 'b2b_place_order:write']);

    expect(link(fixture)?.getAttribute('href')).toBe('/comptes-clients/co_1/nouvelle-commande');
  });

  it('🔴 ne propose aucune saisie sans `b2b_place_order:write`', async () => {
    const fixture = await mount(['b2b_companies:read', 'b2b_orders:read']);

    expect(link(fixture)).toBeNull();
  });
});

describe('ClientCommandesPage — la période', () => {
  it('borne la liste au jour de passation, et rouvre quand on efface', async () => {
    const queries: Partial<AdminOrdersQuery>[] = [];
    const fixture = await mount(['b2b_orders:read'], queries);
    const page = fixture.componentInstance;

    await page['onPlacedFrom']('2026-09-01');
    await page['onPlacedTo']('2026-09-30');
    expect(queries.at(-1)).toMatchObject({
      companyId: 'co_1',
      withSubAccounts: true,
      placedFrom: '2026-09-01',
      placedTo: '2026-09-30',
    });

    await page['onPlacedFrom']('');
    expect(queries.at(-1)).not.toHaveProperty('placedFrom');
    expect(queries.at(-1)).toMatchObject({ placedTo: '2026-09-30' });
  });

  it('dit qu’aucune commande ne répond, pas que le compte n’a rien commandé', async () => {
    const fixture = await mount(['b2b_orders:read']);
    await fixture.componentInstance['onPlacedFrom']('2026-09-01');
    expect(fixture.componentInstance['emptyState']().subtitle).toContain('ces filtres');
  });
});

describe('ClientCommandesPage — le règlement', () => {
  it('filtre sur le règlement, et « Tous » le retire', async () => {
    const queries: Partial<AdminOrdersQuery>[] = [];
    const fixture = await mount(['b2b_orders:read'], queries);
    await fixture.componentInstance['onPayment']('not_required');
    expect(queries.at(-1)).toMatchObject({ paymentStatus: 'not_required' });
    await fixture.componentInstance['onPayment']('any');
    expect(queries.at(-1)).not.toHaveProperty('paymentStatus');
  });
});
