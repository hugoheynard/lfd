import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProductComplianceFinding, ProductComplianceWarningView } from '@lfd/pim-contracts';

import { CatalogueApi, type Category, type Product } from '../catalogue-api';
import { NotifyService } from '../../../notify.service';
import type { ProductStatus } from '../../data/models';
import { ProductsPage } from './products-page';

function category(id: string, name: string, position: number): Category {
  return { id, name: { fr: name }, position, isArchived: false } as Category;
}

function product(id: string, categoryId: string, status: ProductStatus, variantCount = 1): Product {
  const variants = Array.from({ length: variantCount }, (_, i) => ({ id: `${id}-v${String(i)}` }));
  return {
    id,
    sku: id.toUpperCase(),
    name: { fr: `Fiche ${id}` },
    categoryId,
    status,
    variants,
  } as Product;
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
  products: readonly Product[] = PRODUCTS,
  compliance: () => Promise<readonly ProductComplianceWarningView[]> = () => Promise.resolve([]),
  notices: string[] = [],
) {
  TestBed.configureTestingModule({
    imports: [ProductsPage],
    providers: [
      provideRouter([]),
      { provide: NotifyService, useValue: { info: (message: string) => notices.push(message) } },
      {
        provide: CatalogueApi,
        useValue: {
          listProducts: () => Promise.resolve(products),
          listCategories: () => Promise.resolve(CATEGORIES),
          listVatRates: () => Promise.resolve([]),
          publishProduct,
          listComplianceWarnings: compliance,
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
      'Activables',
      'Non conformes en vente',
      'Bloquants',
      'À vérifier',
      'Sans information précise',
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
        queryParams: {
          famille: 'vien',
          etat: null,
          archivees: null,
          images: null,
          declinaisons: null,
        },
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

  it('« Sans image » ne garde que les fiches qui n’en portent aucune, et l’écrit dans l’URL', async () => {
    const illustrated = PRODUCTS.map((p) => ({ ...p, illustrated: p.id !== 'p2' }));
    const { element, navigate, settle } = await render({}, undefined, illustrated);
    element.querySelector<HTMLInputElement>('[data-products-without-images] input')?.click();
    await settle();
    expect(rows(element)).toEqual(['P2']);
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: expect.objectContaining({ images: 'sans' }) }),
    );
  });

  it('lit « Sans image » dans l’URL', async () => {
    const illustrated = PRODUCTS.map((p) => ({ ...p, illustrated: p.id === 'p1' }));
    const { element } = await render({ images: 'sans' }, undefined, illustrated);
    expect(rows(element)).toEqual(['P2', 'V1']);
  });

  it('la colonne Déclinaisons dit le nombre, et le filtre « Plusieurs » ne garde qu’elles', async () => {
    const products = [product('p1', 'pain', 'published', 3), product('p2', 'pain', 'draft', 1)];
    const { element, chip, navigate } = await render({}, undefined, products);
    expect(
      [...element.querySelectorAll('.variants-count')].map((c) => c.textContent?.trim()),
    ).toEqual(['3', '1']);
    await chip('data-products-variants', 'Plusieurs déclinaisons');
    expect(rows(element)).toEqual(['P1']);
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: expect.objectContaining({ declinaisons: 'multiple' }),
      }),
    );
  });

  it('lit « Une déclinaison » dans l’URL', async () => {
    const products = [product('p1', 'pain', 'published', 3), product('p2', 'pain', 'draft', 1)];
    const { element } = await render({ declinaisons: 'single' }, undefined, products);
    expect(rows(element)).toEqual(['P2']);
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

  /**
   * « Activables » (2026-10-26) lit le jugement du serveur, pas le statut :
   * deux brouillons, un seul que l'activation accepterait.
   */
  describe('« Activables »', () => {
    const JUDGED = [
      { ...product('p1', 'pain', 'published'), activatable: false },
      { ...product('p2', 'pain', 'draft'), activatable: true },
      { ...product('p4', 'pain', 'draft'), activatable: false },
      product('v1', 'vien', 'draft'),
    ];

    it('ne montre que les fiches que le serveur dit activables, et l’écrit dans l’URL', async () => {
      const { element, chip, navigate } = await render({}, undefined, JUDGED);
      await chip('data-products-status', 'Activables');
      expect(rows(element)).toEqual(['P2']);
      expect(navigate).toHaveBeenCalledWith(
        [],
        expect.objectContaining({
          queryParams: {
            famille: null,
            etat: 'activatable',
            archivees: null,
            images: null,
            declinaisons: null,
          },
        }),
      );
    });

    it('relit `etat=activatable` de l’URL au chargement', async () => {
      const { element } = await render({ etat: 'activatable' }, undefined, JUDGED);
      expect(rows(element)).toEqual(['P2']);
    });
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

  /** Les constats viennent du serveur (`compliance-warnings`, 2026-10-27) : lus, jamais jugés ici. */
  describe('constats de conformité', () => {
    const blocking = (sku: string): ProductComplianceFinding => ({
      code: 'variant_incomplete',
      severity: 'blocking',
      variantId: 'x',
      sku,
      missing: ['pro_price'],
    });
    // p1 est PUBLIÉE, p2 est un brouillon : le même bloquant ne se dit pas pareil.
    const FINDINGS: readonly ProductComplianceWarningView[] = [
      { productId: 'p1', warnings: [blocking('P1-1')] },
      { productId: 'p2', warnings: [blocking('P2-1')] },
      {
        productId: 'v1',
        warnings: [
          {
            code: 'variant_incomplete',
            severity: 'warning',
            variantId: 'y',
            sku: 'V1-1',
            missing: ['price'],
          },
          { code: 'allergens_precautionary', severity: 'warning', variantId: 'y', sku: 'V1-1' },
        ],
      },
    ];
    const badges = (element: HTMLElement): readonly string[] =>
      [...element.querySelectorAll('[data-products-compliance]')].map(
        (b) => b.textContent?.trim() ?? '',
      );

    it('pose « Non conforme », « Bloquant » et « À vérifier » à côté du statut', async () => {
      const { element } = await render({}, undefined, PRODUCTS, () => Promise.resolve(FINDINGS));
      expect(badges(element)).toEqual(['Non conforme', 'Bloquant', 'À vérifier']);
    });

    /**
     * Régression : une fiche publiée avec un constat bloquant affichait
     * « Publiée » ET « Bloquant » — elle n'est bloquée par rien, elle est déjà
     * en vente (Hugo, 2026-10-27).
     */
    it('une fiche publiée bloquante ne dit pas Bloquant', async () => {
      const { element } = await render({}, undefined, [product('p1', 'pain', 'published')], () =>
        Promise.resolve(FINDINGS),
      );
      expect(badges(element)).toEqual(['Non conforme']);
    });

    it('filtre les non conformes en vente, les bloquants et les fiches à vérifier', async () => {
      const { element, chip } = await render({}, undefined, PRODUCTS, () =>
        Promise.resolve(FINDINGS),
      );
      await chip('data-products-status', 'Non conformes en vente');
      expect(rows(element)).toEqual(['P1']);
      await chip('data-products-status', 'Bloquants');
      expect(rows(element)).toEqual(['P2']);
      await chip('data-products-status', 'À vérifier');
      expect(rows(element)).toEqual(['V1']);
      await chip('data-products-status', 'Sans information précise');
      expect(rows(element)).toEqual(['V1']);
    });

    /** `plan-allergenes-jamais-bloquants.md` §2 : un toast d'information, qui ne demande rien. */
    it('annonce d’un toast la publication d’une fiche sans déclaration d’allergènes', async () => {
      const products = [product('p2', 'pain', 'draft')];
      const notices: string[] = [];
      const precautionary: readonly ProductComplianceWarningView[] = [
        {
          productId: 'p2',
          warnings: [
            { code: 'allergens_precautionary', severity: 'warning', variantId: 'z', sku: 'P2-1' },
          ],
        },
      ];
      const publish = (): Promise<void> => {
        products[0] = product('p2', 'pain', 'published');
        return Promise.resolve();
      };
      const { fixture } = await render(
        {},
        publish,
        products,
        () => Promise.resolve(precautionary),
        notices,
      );

      await fixture.componentInstance['publish'](product('p2', 'pain', 'draft'));

      expect(notices).toEqual([expect.stringContaining('sans information précise')]);
    });

    it('ne dit rien à la publication d’une fiche déclarée', async () => {
      const products = [product('p2', 'pain', 'draft')];
      const notices: string[] = [];
      const publish = (): Promise<void> => {
        products[0] = product('p2', 'pain', 'published');
        return Promise.resolve();
      };
      const { fixture } = await render({}, publish, products, undefined, notices);

      await fixture.componentInstance['publish'](product('p2', 'pain', 'draft'));

      expect(notices).toEqual([]);
    });

    it('garde la liste quand les constats ne se lisent pas, et le dit', async () => {
      const { element } = await render({}, undefined, PRODUCTS, () =>
        Promise.reject(new Error('panne')),
      );
      expect(rows(element)).toEqual(['P1', 'P2', 'V1']);
      expect(element.querySelector('fold-callout')?.textContent).toContain(
        "Les constats de conformité n'ont pas pu être lus",
      );
    });
  });
});
