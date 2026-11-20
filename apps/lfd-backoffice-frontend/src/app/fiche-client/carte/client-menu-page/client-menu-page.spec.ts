import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  CustomerSheetView,
  PublishedCatalogView,
  StaffPermission,
  SubAccountMenuPayload,
  SubAccountMenuView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { CatalogueService } from '../../../b2b/catalogue/catalogue.service';
import { CompanyDetailStore } from '../../../comptes-clients/company-cache/company-detail.store';
import { NotifyService } from '../../../notify.service';
import { ClientSheetStore } from '../../client-sheet.store';
import { SubAccountMenuService } from '../sub-account-menu.service';
import { ClientMenuPage } from './client-menu-page';

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
  menu: SubAccountMenuView['menu'];
  refuse: boolean;
}

async function boot(
  parent: CustomerSheetView['parent'],
  granted: readonly StaffPermission[] = ['b2b_companies:write'],
): Promise<{ fixture: ComponentFixture<ClientMenuPage>; wire: Wire; host: HTMLElement }> {
  const wire: Wire = { saved: [], keys: [], menu: null, refuse: false };
  const sheet = { companyId: 'site', parent };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ClientSheetStore,
        useValue: {
          sheet: signal(sheet),
          state: signal('ready'),
          reload: (): Promise<void> => Promise.resolve(),
        },
      },
      { provide: PermissionsStore, useValue: { can: (p: StaffPermission) => granted.includes(p) } },
      { provide: NotifyService, useValue: { success: (): void => undefined } },
      { provide: CatalogueService, useValue: { published: () => Promise.resolve(CATALOGUE) } },
      {
        provide: CompanyDetailStore,
        useValue: {
          get: () =>
            Promise.resolve({
              hierarchy: {
                subAccounts: [
                  { id: 'site', enseigne: 'Chalet A' },
                  { id: 'frere', enseigne: 'Chalet B' },
                ],
              },
            }),
        },
      },
      {
        provide: SubAccountMenuService,
        useValue: {
          read: (companyId: string): Promise<SubAccountMenuView> =>
            Promise.resolve({ companyId, menu: wire.menu }),
          save: (_id: string, payload: SubAccountMenuPayload, key: string): Promise<void> => {
            wire.keys.push(key);
            if (wire.refuse) {
              return Promise.reject(new Error('refus'));
            }
            wire.saved.push(payload);
            return Promise.resolve();
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ClientMenuPage);
  await settle(fixture);
  return { fixture, wire, host: fixture.nativeElement as HTMLElement };
}

async function settle(fixture: ComponentFixture<ClientMenuPage>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

function saveButton(host: HTMLElement): HTMLButtonElement {
  const found = host.querySelector<HTMLButtonElement>('[data-save]');
  if (found === null) {
    throw new Error('Enregistrer introuvable');
  }
  return found;
}

describe('ClientMenuPage', () => {
  it('un compte sans principal n’a pas de carte', async () => {
    const { host } = await boot(null);
    expect(host.querySelector('[data-no-parent]')).not.toBeNull();
  });

  it('sans carte posée : tout ouvert, et Enregistrer attend un changement', async () => {
    const { host } = await boot({ id: 'p', enseigne: 'Club', kind: 'site' });
    expect(host.querySelector('[data-summary]')?.textContent).toContain('2 articles ouverts');
    expect(saveButton(host).disabled).toBe(true);
    expect(host.querySelector('[data-sku="TAR-8"]')).not.toBeNull();
  });

  it('pose une exclusion au grain SKU et envoie la carte entière', async () => {
    const { fixture, wire, host } = await boot({ id: 'p', enseigne: 'Club', kind: 'site' });
    const exclude = host.querySelector<HTMLElement>(
      '[data-sku="TAR-8"] fold-view-toggle button:nth-of-type(3)',
    );
    exclude?.click();
    await settle(fixture);
    expect(host.querySelector('[data-summary]')?.textContent).toContain('1 articles ouverts');
    saveButton(host).click();
    await settle(fixture);
    expect(wire.saved).toEqual([
      {
        mode: 'except',
        offMenu: 'visible_locked',
        entries: [{ level: 'sku', ref: 'TAR-8', effect: 'exclude' }],
      },
    ]);
  });

  it('un refus du serveur reste à l’écran', async () => {
    const { fixture, wire, host } = await boot({ id: 'p', enseigne: 'Club', kind: 'site' });
    wire.refuse = true;
    host.querySelector<HTMLElement>('[data-mode] button:nth-of-type(2)')?.click();
    await settle(fixture);
    saveButton(host).click();
    await settle(fixture);
    expect(host.querySelector('[data-refusal]')).not.toBeNull();
    expect(host.querySelector('[data-closed-all]')).not.toBeNull();
    // Le réessai du même brouillon reprend la même clé d'intention.
    saveButton(host).click();
    await settle(fixture);
    expect(wire.keys).toHaveLength(2);
    expect(wire.keys[1]).toBe(wire.keys[0]);
  });

  it('sans droit d’écrire : ni bouton, ni réglage', async () => {
    const { host } = await boot({ id: 'p', enseigne: 'Club', kind: 'site' }, []);
    expect(host.querySelector('[data-save]')).toBeNull();
    expect(host.querySelector('[data-sku="TAR-8"] fold-view-toggle')).toBeNull();
  });
});
