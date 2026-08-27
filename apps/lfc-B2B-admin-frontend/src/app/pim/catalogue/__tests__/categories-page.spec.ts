import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { CategoriesPage } from '../categories-page/categories-page';
import { CategoryHttpApi } from '../category-http-api';
import { PointOfSaleHttpApi } from '../../points-of-sale/point-of-sale-http-api';
import { VatRateHttpApi } from '../vat-rates/vat-http-api';
import type { Category } from '../../data/models';

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat_1',
    name: { fr: 'Viennoiseries' },
    slug: { fr: 'viennoiseries' },
    parentId: null,
    position: 0,
    isArchived: false,
    channelPreset: [],
    vatByContext: {},
    activeProductCount: 0,
    ...overrides,
  };
}

async function render(rows: Category[]): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideRouter([]),
      { provide: CategoryHttpApi, useValue: { list: async () => rows } },
      { provide: VatRateHttpApi, useValue: { list: async () => [] } },
      { provide: PointOfSaleHttpApi, useValue: { list: async () => [] } },
    ],
  });
  const fixture = TestBed.createComponent(CategoriesPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

/** Le texte de chaque ligne rendue par le tableau. */
function rows(host: HTMLElement): string[] {
  return [...host.querySelectorAll('tbody tr')].map((row) =>
    (row.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
}

describe('CategoriesPage — les archivées', () => {
  it('les masque par défaut', async () => {
    const host = await render([
      category(),
      category({ id: 'cat_2', name: { fr: 'Anciennes' }, isArchived: true }),
    ]);

    expect(rows(host)).toHaveLength(1);
    expect(rows(host)[0]).toContain('Viennoiseries');
    expect(rows(host)[0]).not.toContain('Anciennes');
  });

  it("n'offre l'œil que s'il y a quelque chose à rappeler", async () => {
    const host = await render([category()]);

    expect(host.querySelectorAll('fold-toggle-icon')).toHaveLength(0);
  });

  it("le vide ne ment pas : il dit que des archivées attendent derrière l'œil", async () => {
    // « Aucune catégorie » inviterait à en créer une alors qu'il y en a — et
    // que la page en cache l'unique exemplaire.
    const host = await render([category({ isArchived: true })]);

    expect(host.textContent).toContain('Aucune famille active');
    expect(host.textContent).not.toContain('Commencez par');
  });
});

describe('CategoriesPage — les canaux par défaut', () => {
  it('affiche la pastille B2B d’une famille vendue en B2B', async () => {
    // Le gabarit lisait `channelPreset.b2b` — une propriété sur un TABLEAU
    // depuis que la matrice est une liste de paires, donc toujours `undefined`.
    // La pastille ne s'affichait jamais, et une famille vendue uniquement en
    // B2B se lisait « Aucun canal ». Le typage ne l'a pas vu : le contexte d'un
    // `ng-template` est `any`.
    const host = await render([
      category({ channelPreset: [{ pointOfSaleId: 'pos_b2b', context: 'b2b' }] }),
    ]);

    expect(rows(host)[0]).toContain('B2B');
    expect(rows(host)[0]).not.toContain('Aucun canal');
  });
});
