import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  CommerceOperationView,
  OperationsMigrationReport,
  StaffPermission,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { commerceOperation } from '../commerce-operation.testing';
import { CommerceOperationsService } from '../commerce-operations.service';
import { CommerceOperationsPage } from './commerce-operations-page';

const EMPTY_REPORT: OperationsMigrationReport = {
  readAt: '2026-10-16T08:00:00.000Z',
  counts: {
    referential: 0,
    mirror: 0,
    restrictions: 0,
    toWrite: 0,
    alreadyAtCommerce: 0,
    mirrorOnly: 0,
    blocked: 0,
  },
  blocked: false,
  operations: [],
};

async function render(
  list: () => Promise<readonly CommerceOperationView[]>,
  granted: readonly StaffPermission[] = ['lfc_operations:read'],
) {
  TestBed.configureTestingModule({
    imports: [CommerceOperationsPage],
    providers: [
      provideRouter([]),
      {
        provide: CommerceOperationsService,
        useValue: { list, previewMigration: async () => EMPTY_REPORT },
      },
      {
        provide: PermissionsStore,
        useValue: {
          can: (permission: StaffPermission) => granted.includes(permission),
          permissions: signal(granted),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(CommerceOperationsPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('CommerceOperationsPage', () => {
  it('une panne se dit en alerte, avec Réessayer', async () => {
    const root = await render(async () => {
      throw new Error('réseau');
    });
    expect(root.textContent).toContain('Impossible de charger les opérations');
  });

  it('range les archivées à part et dit ce que verra le client', async () => {
    const root = await render(async () => [
      commerceOperation({ shopDisplay: 'announcement_only', withoutSellingArticle: true }),
      commerceOperation({
        key: 'galette-2026',
        name: { fr: 'Galette 2026' },
        archivedAt: '2026-02-01T10:00:00.000Z',
        state: 'ended',
        shopDisplay: 'nothing',
      }),
    ]);
    const cards = root.querySelectorAll('fold-card');
    expect(cards).toHaveLength(2);
    expect(cards[0]?.textContent).toContain("En boutique : l'annonce seule, sans produit");
    expect(cards[1]?.textContent).toContain('Galette 2026');
    expect(cards[1]?.textContent).toContain('Archivée');
    expect(root.querySelector('img')?.getAttribute('alt')).toBe('Une bûche');
  });

  it('avertit quand les commandes sont ouvertes sans produit', async () => {
    const root = await render(async () => [
      commerceOperation({ state: 'open', awaitingProducts: true, withoutSellingArticle: true }),
    ]);
    expect(root.textContent).toContain('Les produits arrivent bientôt');
  });

  it('Préparer reste visible mais fermé tant que la liste ne se lit pas', async () => {
    const root = await render(async () => {
      throw new Error('réseau');
    }, ['lfc_operations:read', 'lfc_operations:write']);
    const prepare = [...root.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Préparer une opération'),
    );
    expect(prepare?.disabled).toBe(true);
  });

  it('Préparer est ouvert une fois la liste lue, et absent sans droit', async () => {
    const writer = await render(async () => [], ['lfc_operations:read', 'lfc_operations:write']);
    const prepare = [...writer.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Préparer une opération'),
    );
    expect(prepare?.disabled).toBe(false);
    TestBed.resetTestingModule();
    const reader = await render(async () => []);
    expect(reader.textContent).not.toContain('Préparer une opération');
  });

  it("ne montre la reprise qu'à qui peut l'appliquer", async () => {
    expect(
      (await render(async () => [])).querySelector('app-operations-migration-card'),
    ).toBeNull();
    TestBed.resetTestingModule();
    const writer = await render(async () => [], ['lfc_operations:read', 'lfc_operations:write']);
    expect(writer.querySelector('app-operations-migration-card')).not.toBeNull();
  });
});
