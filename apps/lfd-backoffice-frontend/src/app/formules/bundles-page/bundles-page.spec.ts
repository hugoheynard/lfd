import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { BundleView, StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { bundleChoice, bundleGroup, bundleView } from '../bundle.testing';
import { BundlesService } from '../bundles.service';
import { BundlesPage } from './bundles-page';

async function render(
  list: () => Promise<readonly BundleView[]>,
  granted: readonly StaffPermission[] = ['shop_bundles:read'],
) {
  TestBed.configureTestingModule({
    imports: [BundlesPage],
    providers: [
      provideRouter([]),
      { provide: BundlesService, useValue: { list } },
      {
        provide: PermissionsStore,
        useValue: {
          can: (permission: StaffPermission) => granted.includes(permission),
          permissions: signal(granted),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(BundlesPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const createButtons = (root: HTMLElement) =>
  [...root.querySelectorAll('button')].filter((b) => b.textContent?.includes('Créer une formule'));

describe('BundlesPage', () => {
  it('une panne se dit en alerte, avec Réessayer — jamais en liste vide', async () => {
    const root = await render(async () => {
      throw new Error('réseau');
    });
    expect(root.textContent).toContain('Impossible de charger les formules');
    expect(root.textContent).toContain('Réessayer');
    expect(root.textContent).not.toContain('Aucune formule');
  });

  it('vide : invite à créer qui peut écrire', async () => {
    const root = await render(async () => [], ['shop_bundles:read', 'shop_bundles:write']);
    expect(root.textContent).toContain('Aucune formule');
    expect(createButtons(root).length).toBe(2);
  });

  it('vide, en lecture seule : aucun bouton de création', async () => {
    const root = await render(async () => []);
    expect(root.textContent).toContain('Aucune formule');
    expect(createButtons(root)).toHaveLength(0);
  });

  it('une ligne par formule : nom, statut, groupes et articles', async () => {
    const root = await render(async () => [
      bundleView(),
      bundleView({ key: 'gouter', name: 'Goûter', status: 'withdrawn' }),
    ]);
    const rows = root.querySelectorAll('li.bundle');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('Petit-déjeuner');
    expect(rows[0]?.textContent).toContain('Brouillon');
    expect(rows[0]?.textContent).toContain('2 groupes · 2 articles');
    expect(rows[1]?.textContent).toContain('Retirée');
  });

  it('signale une formule dont un article n’est plus admissible', async () => {
    const root = await render(async () => [
      bundleView({
        groups: [
          bundleGroup({ choices: [bundleChoice({ standing: 'operation_only' })] }),
          bundleGroup({ key: 'b', choices: [bundleChoice({ sku: 'X', standing: 'unknown' })] }),
        ],
      }),
    ]);
    expect(root.querySelector('fold-callout')?.textContent).toContain('2 articles ne sont plus');
  });
});
