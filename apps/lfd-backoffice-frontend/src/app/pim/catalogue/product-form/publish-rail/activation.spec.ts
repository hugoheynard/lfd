import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { ProductStatus } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { CatalogueApi } from '../../catalogue-api';
import { ProductHttpApi } from '../../product-http-api';
import { ReferenceApi } from '../../reference-api';
import { provideTestSalesContexts } from '../../../sales-contexts/sales-context-store.testing';
import { ProductFormStore } from '../product-form-store';
import { PublishRail } from './publish-rail';

/**
 * **Activer / Désactiver** (lot 3 de `plan-catalogue-synchronise-par-audience.md`,
 * C1) : les gestes du rail ont changé de nom, pas de route — et le refus
 * d'activer montre ce qui manque, déclinaison par déclinaison.
 */

/** Le message que le référentiel rend (`ProductNotActivatableError`). */
const REFUSAL =
  "Activation refusée : aucune déclinaison n'est complète, et il en suffit d'une — " +
  "CHO-001-1 : prix public (section « Tarif »), déclaration d'allergènes ; " +
  'CHO-001-2 : taux de TVA « b2b » (famille ou fiche).';

function detail(status: ProductStatus) {
  return {
    product: {
      id: 'prd_1',
      sku: 'CHO-001',
      name: { fr: 'Gros florentin lait' },
      slug: { fr: 'gros-florentin-lait' },
      kind: 'daily',
      categoryId: 'cat_1',
      status,
      variants: [],
      vatByContext: {},
      audience: null,
    },
    editorial: { descriptionShort: null },
    media: [],
    readiness: null,
    readinessStale: false,
  };
}

async function setup(status: ProductStatus, publish: () => Promise<void>) {
  const routes: string[] = [];
  TestBed.configureTestingModule({
    providers: [
      ProductFormStore,
      provideHttpClient(),
      provideTestSalesContexts(),
      {
        provide: ProductHttpApi,
        useValue: {
          getDetail: () => Promise.resolve(detail(status)),
          citedAllergens: () => Promise.resolve([]),
        },
      },
      {
        provide: CatalogueApi,
        useValue: {
          listCategories: () => Promise.resolve([]),
          listVatRates: () => Promise.resolve([]),
          publishProduct: async () => {
            routes.push('publish');
            await publish();
          },
          unpublishProduct: async () => {
            routes.push('unpublish');
          },
        },
      },
      { provide: ReferenceApi, useValue: { allergens: () => Promise.resolve({ entries: [] }) } },
    ],
  });
  const store = TestBed.inject(ProductFormStore);
  await store.init('prd_1');
  const fixture = TestBed.createComponent(PublishRail);
  fixture.componentInstance.publish.subscribe(() => void store.runLifecycle('publish'));
  fixture.componentInstance.unpublish.subscribe(() => void store.runLifecycle('unpublish'));
  fixture.detectChanges();
  return { store, fixture, routes, host: fixture.nativeElement as HTMLElement };
}

function buttons(host: HTMLElement): string[] {
  return [...host.querySelectorAll('button')].map((button) => button.textContent?.trim() ?? '');
}

function click(host: HTMLElement, label: string): void {
  const found = [...host.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === label,
  );
  if (found === undefined) {
    throw new Error(`bouton « ${label} » absent`);
  }
  found.click();
}

describe('PublishRail — Activer / Désactiver', () => {
  it('propose « Activer » sur une fiche inactive, jamais l’ancien « Publier »', async () => {
    const { host } = await setup('draft', async () => undefined);
    expect(buttons(host)).toContain('Activer');
    expect(buttons(host)).not.toContain('Désactiver');
    expect(host.textContent).not.toContain('Publier au catalogue');
  });

  it('propose « Désactiver » sur une fiche active, sur la route de dépublication', async () => {
    const { host, fixture, routes } = await setup('published', async () => undefined);
    expect(buttons(host)).toContain('Désactiver');
    expect(buttons(host)).not.toContain('Activer');
    expect(host.textContent).not.toContain('Dépublier');

    click(host, 'Désactiver');
    await fixture.whenStable();
    expect(routes).toEqual(['unpublish']);
  });

  it('montre le refus d’activer en une ligne par déclinaison', async () => {
    const { host, fixture, store, routes } = await setup('draft', () =>
      Promise.reject(
        new HttpErrorResponse({
          status: 409,
          error: { code: 'catalogue.product.not_activatable', message: REFUSAL },
        }),
      ),
    );

    click(host, 'Activer');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(routes).toEqual(['publish']);
    const lines = [...host.querySelectorAll('.pr-gaps li')].map((li) => li.textContent?.trim());
    expect(lines).toEqual([
      "CHO-001-1 : prix public (section « Tarif »), déclaration d'allergènes",
      'CHO-001-2 : taux de TVA « b2b » (famille ou fiche)',
    ]);
    expect(host.querySelector('.pr-refusal')?.textContent).toContain('Activation refusée');
    // Rangé à part : la bannière d'erreur générale de la page reste vide.
    expect(store.error()).toBeNull();
  });

  it('laisse les autres refus à la bannière générale', async () => {
    const { host, fixture, store } = await setup('draft', () =>
      Promise.reject(
        new HttpErrorResponse({
          status: 409,
          error: { code: 'catalogue.product.archived_not_publishable', message: 'Archivé.' },
        }),
      ),
    );

    click(host, 'Activer');
    await fixture.whenStable();

    expect(store.activationRefusal()).toBeNull();
    expect(store.error()).toBe('Archivé.');
  });
});
