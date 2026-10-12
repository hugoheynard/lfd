import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { AdminCatalogService } from '../../../commandes/catalog.service';
import { AdminOrdersService } from '../../../commandes/orders.service';
import { AdminCompaniesService } from '../../../comptes-clients/admin-companies.service';
import { NotifyService } from '../../../notify.service';
import { TarificationService } from '../tarification.service';
import { SimulateurPage } from './simulateur-page';

/**
 * Écart 4 de `droits-des-commandes.md` (corrigé le 2026-10-12) : chaque ligne
 * du banc est un devis par `POST /admin/orders/quote`, qui exige
 * `b2b_place_order:write`, alors que la page n'a que la garde du bloc `/b2b`.
 */
async function mount(
  permissions: readonly StaffPermission[],
): Promise<{ fixture: ComponentFixture<SimulateurPage>; quote: ReturnType<typeof vi.fn> }> {
  const quote = vi.fn(() => Promise.reject(new Error('403')));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [SimulateurPage],
    providers: [
      provideRouter([]),
      { provide: AdminCompaniesService, useValue: { list: () => Promise.resolve([]) } },
      { provide: AdminCatalogService, useValue: { list: () => Promise.resolve([]) } },
      { provide: AdminOrdersService, useValue: { quote } },
      { provide: TarificationService, useValue: { project: vi.fn() } },
      { provide: NotifyService, useValue: { success: vi.fn(), error: vi.fn() } },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(SimulateurPage);
  fixture.detectChanges();
  await fixture.whenStable();
  await Promise.resolve();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, quote };
}

const host = (fixture: ComponentFixture<SimulateurPage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('SimulateurPage — droit de sonder', () => {
  it('propose de sonder le prix avec `b2b_place_order:write`', async () => {
    const { fixture } = await mount(['b2b_settings:read', 'b2b_place_order:write']);

    expect(host(fixture).querySelector('[data-quote-forbidden]')).toBeNull();
    expect(host(fixture).textContent).toContain('Sonder le prix');
  });

  it('🔴 sans `b2b_place_order:write`, dit le droit manquant et ne lance aucun devis', async () => {
    const { fixture, quote } = await mount(['b2b_settings:read']);

    expect(host(fixture).querySelector('[data-quote-forbidden]')?.textContent).toContain(
      'Passer une commande pro',
    );
    expect(host(fixture).textContent).not.toContain('Sonder le prix');
    expect(quote).not.toHaveBeenCalled();
  });
});
