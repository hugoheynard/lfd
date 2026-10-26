import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CatalogueApi, type Category, type Product } from '../catalogue-api';
import type { ProductStatus } from '../../data/models';
import { ProductsPage } from './products-page';

function category(id: string, name: string, position: number): Category {
  return { id, name: { fr: name }, position, isArchived: false } as Category;
}

function product(id: string, categoryId: string, status: ProductStatus): Product {
  return { id, sku: id.toUpperCase(), name: { fr: `Fiche ${id}` }, categoryId, status } as Product;
}

// Le pain est second au catalogue même s'il arrive premier : l'ordre est `position`.
const CATEGORIES = [category('pain', 'Pains', 2), category('vien', 'Viennoiseries', 1)];
const PRODUCTS = [
  product('p1', 'pain', 'published'),
  product('p2', 'pain', 'draft'),
  product('p3', 'pain', 'archived'),
  product('v1', 'vien', 'published'),
  product('v2', 'vien', 'archived'),
];

async function render(
  queryParams: Readonly<Record<string, string>> = {},
  publishProduct: (id: string) => Promise<void> = () => Promise.resolve(),
) {
  TestBed.configureTestingModule({
    imports: [ProductsPage],
    providers: [
      provideRouter([]),
      {
        provide: CatalogueApi,
        useValue: {
          listProducts: () => Promise.resolve(PRODUCTS),
          listCategories: () => Promise.resolve(CATEGORIES),
          listVatRates: () => Promise.resolve([]),
          publishProduct,
        },
      },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
      },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(ProductsPage);
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const settle = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const chip = async (attr: string, label: string): Promise<void> => {
    const button = [...element.querySelectorAll<HTMLButtonElement>(`[${attr}] button`)].find(
      (b) => b.textContent?.trim() === label,
    );
    button?.click();
    await settle();
  };
  const mask = (): HTMLInputElement | null =>
    element.querySelector<HTMLInputElement>('[data-products-mask] input');
  return { fixture, element, navigate, chip, mask, settle };
}

function rows(element: HTMLElement): readonly string[] {
  return [...element.querySelectorAll('tbody code')].map((c) => c.textContent?.trim() ?? '');
}

function chips(element: HTMLElement, attr: string): readonly string[] {
  return [...element.querySelectorAll(`[${attr}] button`)].map((b) => b.textContent?.trim() ?? '');
}

describe('ProductsPage — filtres famille, état et masque des archivées', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('masque les archivées par défaut', async () => {
    const { element } = await render();
    expect(rows(element)).toEqual(['P1', 'P2', 'V1']);
  });

  it('propose « Tout » puis les familles dans l’ordre du catalogue', async () => {
    const { element } = await render();
    expect(chips(element, 'data-products-family')).toEqual(['Tout', 'Viennoiseries', 'Pains']);
    expect(chips(element, 'data-products-status')).toEqual([
      'Toutes',
      'Actives',
      'Inactives',
      'Archivées',
    ]);
  });

  it('filtre par famille et l’écrit dans l’URL', async () => {
    const { element, navigate, chip } = await render();
    await chip('data-products-family', 'Viennoiseries');
    expect(rows(element)).toEqual(['V1']);
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: { famille: 'vien', etat: null, archivees: null },
        replaceUrl: true,
      }),
    );
  });

  it('l’état « Archivées » les montre malgré le masque, qui se grise', async () => {
    const { element, chip, mask } = await render();
    await chip('data-products-status', 'Archivées');
    expect(rows(element)).toEqual(['P3', 'V2']);
    expect(mask()?.disabled).toBe(true);
  });

  it('lever le masque montre tout', async () => {
    const { element, mask, settle } = await render();
    mask()?.click();
    await settle();
    expect(rows(element)).toEqual(['P1', 'P2', 'P3', 'V1', 'V2']);
  });

  it('combine famille, état et recherche', async () => {
    const { element, chip } = await render();
    await chip('data-products-family', 'Pains');
    await chip('data-products-status', 'Inactives');
    expect(rows(element)).toEqual(['P2']);
    await chip('data-products-status', 'Actives');
    await chip('data-products-family', 'Tout');
    expect(rows(element)).toEqual(['P1', 'V1']);
  });

  it('dit qu’aucune fiche ne correspond plutôt que d’inviter à créer', async () => {
    const { element, chip } = await render({ famille: 'vien' });
    await chip('data-products-status', 'Inactives');
    expect(rows(element)).toEqual([]);
    expect(element.textContent).toContain('Aucune fiche ne correspond');
  });

  it('relit les filtres de l’URL au chargement', async () => {
    const { element } = await render({ famille: 'pain', archivees: 'visibles' });
    expect(rows(element)).toEqual(['P1', 'P2', 'P3']);
  });

  it('la sélection perd les lignes que le filtre cache', async () => {
    const { element, chip, settle } = await render();
    for (const box of element.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]')) {
      box.click();
    }
    await settle();
    expect(element.textContent).toContain('Actions (3)');
    await chip('data-products-family', 'Viennoiseries');
    expect(element.textContent).toContain('Actions (1)');
  });
});

describe('ProductsPage — « Activer » refusé', () => {
  afterEach(() => TestBed.resetTestingModule());

  /**
   * Régression : le 409 `catalogue.product.not_activatable` s'affichait
   * « Erreur inattendue. » — une `HttpErrorResponse` n'est pas une `Error`
   * (constaté le 2026-10-26).
   */
  it('montre le message du serveur, qui nomme chaque déclinaison', async () => {
    const message = 'Activation refusée — P2-1 : prix pro absent ; P2-2 : allergènes non déclarés.';
    const refusal = new HttpErrorResponse({
      status: 409,
      error: { code: 'catalogue.product.not_activatable', message },
    });
    const { fixture, element, settle } = await render({}, () => Promise.reject(refusal));
    await fixture.componentInstance['publish'](PRODUCTS[1] as Product);
    await settle();
    const callout = element.querySelector('fold-callout')?.textContent ?? '';
    expect(callout).toContain(message);
    expect(callout).not.toContain('Erreur inattendue');
  });
});

describe('ProductsPage — « Activer la sélection »', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('active en série, liste les refus et ne s’arrête pas au premier', async () => {
    const order: string[] = [];
    let inFlight = 0;
    const publish = async (id: string): Promise<void> => {
      inFlight += 1;
      expect(inFlight).toBe(1);
      order.push(id);
      await Promise.resolve();
      inFlight -= 1;
      if (id === 'p2') {
        throw new HttpErrorResponse({ status: 409, error: { message: 'P2-1 : prix pro absent' } });
      }
    };
    const { fixture, element, settle } = await render({}, publish);
    fixture.componentInstance['selection'].set(new Set(['p2', 'p1']));
    await fixture.componentInstance['activateSelected']();
    await settle();
    expect(order).toEqual(['p1', 'p2']);
    const callout = element.querySelector('fold-callout')?.textContent ?? '';
    expect(callout).toContain('1 fiche(s) activée(s)');
    expect(callout).toContain('P2 — P2-1 : prix pro absent');
  });
});
