import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  CustomerSheetView,
  PrincipalSitesMenuView,
  PublishedCatalogView,
  SubAccountMenuPayload,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { CatalogueService } from '../../../b2b/catalogue/catalogue.service';
import { NotifyService } from '../../../notify.service';
import { ClientSheetStore } from '../../client-sheet.store';
import { SubAccountMenuService } from '../sub-account-menu.service';
import { SitesMenuPage } from './sites-menu-page';

const CELLS = {
  inactif: 0,
  en_vente: 0,
  masque: 0,
  pas_vendu: 0,
  en_attente_validation: 0,
  incomplet: 0,
};

const CATALOGUE: PublishedCatalogView = {
  shelves: [
    {
      categoryId: 'pat',
      name: 'Pâtisserie',
      position: 0,
      withdrawn: false,
      pro: CELLS,
      public: CELLS,
    },
  ],
  entries: [
    {
      productId: 'p1',
      productSku: 'TAR',
      name: 'Tarte au citron',
      categoryId: 'pat',
      categoryPath: ['pat'],
      status: 'active',
      audience: 'pro',
      audienceInherited: true,
      familyAudience: 'pro',
      receivedAt: '2026-11-01T00:00:00.000Z',
      variants: ['TAR-6', 'TAR-8'].map((sku) => ({
        sku,
        name: sku,
        onSale: true,
        isDefault: sku === 'TAR-6',
        saleUnit: 'piece' as const,
        gaps: [],
        reviewPending: { pro: false, public: false },
        pro: { state: 'en_vente' as const, htMillicents: 100_000 },
        public: { state: 'pas_vendu' as const, ttcCents: null },
      })),
    },
  ],
  pendingReview: [],
};

interface Wire {
  readonly saved: SubAccountMenuPayload[];
  readonly keys: string[];
}

async function boot(
  parent: CustomerSheetView['parent'],
): Promise<{ fixture: ComponentFixture<SitesMenuPage>; wire: Wire; host: HTMLElement }> {
  const wire: Wire = { saved: [], keys: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ClientSheetStore,
        useValue: {
          sheet: signal({ companyId: 'principal', parent }),
          state: signal('ready'),
          reload: (): Promise<void> => Promise.resolve(),
        },
      },
      { provide: PermissionsStore, useValue: { can: (): boolean => true } },
      { provide: NotifyService, useValue: { success: (): void => undefined } },
      { provide: CatalogueService, useValue: { published: () => Promise.resolve(CATALOGUE) } },
      {
        provide: SubAccountMenuService,
        useValue: {
          readSitesMenu: (companyId: string): Promise<PrincipalSitesMenuView> =>
            Promise.resolve({ companyId, menu: null }),
          saveSitesMenu: (_id: string, payload: SubAccountMenuPayload, key: string) => {
            wire.keys.push(key);
            wire.saved.push(payload);
            return Promise.resolve();
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(SitesMenuPage);
  await settle(fixture);
  return { fixture, wire, host: fixture.nativeElement as HTMLElement };
}

async function settle(fixture: ComponentFixture<SitesMenuPage>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('SitesMenuPage', () => {
  it('un site n’a pas de carte commune', async () => {
    const { host } = await boot({ id: 'p', enseigne: 'Club', kind: 'site' });
    expect(host.querySelector('[data-is-site]')).not.toBeNull();
  });

  it('pose la carte commune entière, sous une clé d’intention', async () => {
    const { fixture, wire, host } = await boot(null);
    expect(host.querySelector('[data-common-explained]')?.textContent).toContain('exempter');
    host.querySelector<HTMLElement>('[data-mode] button:nth-of-type(2)')?.click();
    await settle(fixture);
    host.querySelector<HTMLElement>('[data-save]')?.click();
    await settle(fixture);
    expect(wire.saved).toEqual([{ mode: 'only', offMenu: 'visible_locked', entries: [] }]);
    expect(wire.keys).toHaveLength(1);
  });
});
