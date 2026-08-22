import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { CategoriesPage } from '../categories-page/categories-page';
import { CategoryHttpApi } from '../category-http-api';
import { EmplacementHttpApi } from '../../emplacements/emplacement-http-api';
import { TvaHttpApi } from '../tva-rates/tva-http-api';
import type { Category } from '../../data/models';

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat_1',
    name: { fr: 'Viennoiseries' },
    slug: { fr: 'viennoiseries' },
    parentId: null,
    position: 0,
    isArchived: false,
    channelPreset: { boutiques: {}, b2b: false },
    emporterTvaId: '',
    surPlaceTvaId: '',
    b2bTvaId: '',
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
      { provide: TvaHttpApi, useValue: { list: async () => [] } },
      { provide: EmplacementHttpApi, useValue: { list: async () => [] } },
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
