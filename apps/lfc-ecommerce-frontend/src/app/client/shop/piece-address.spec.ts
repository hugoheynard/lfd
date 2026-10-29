import { DOCUMENT, Location } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter, Router, type Routes } from '@angular/router';
import type { ShopCatalogueView } from '@lfd/contracts';
import { vi } from 'vitest';

import { PieceAddress } from './piece-address';
import { PieceHead } from './piece-head';
import { PIECE_SKU_PARAM } from './piece-route';
import { hydrateWith, TEST_CATALOGUE, TEST_ITEMS } from './shop-catalogue.fixture';
import { ShopCatalogue } from './shop-catalogue.store';

/** Les routes de la boutique, telles que `app.routes.ts` les déclare. */
const ROUTES: Routes = [
  { path: 'accueil', children: [] },
  {
    path: 'boutique',
    children: [
      { path: '', children: [] },
      { path: `article/:${PIECE_SKU_PARAM}`, children: [] },
    ],
  },
];

describe('PieceAddress — la fiche d’un article a une adresse', () => {
  const ITEM = TEST_ITEMS[0];
  if (ITEM === undefined) {
    throw new RangeError('la fixture du catalogue est vide');
  }
  const CANONICAL = `/boutique/article/${ITEM.sku}`;
  let router: Router;
  let address: PieceAddress;

  async function arrive(url: string, view: ShopCatalogueView = TEST_CATALOGUE): Promise<void> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter(ROUTES), provideHttpClient(), PieceAddress, PieceHead],
    });
    hydrateWith(TestBed.inject(ShopCatalogue), view);
    router = TestBed.inject(Router);
    await router.navigateByUrl('/accueil');
    await router.navigateByUrl(url);
    address = TestBed.inject(PieceAddress);
    await settle();
  }

  async function settle(): Promise<void> {
    for (let pass = 0; pass < 3; pass += 1) {
      TestBed.tick();
      await new Promise((resolve) => setTimeout(resolve));
    }
    TestBed.tick();
  }

  const canonicalHref = (): string | null =>
    TestBed.inject(DOCUMENT).head.querySelector('link[rel="canonical"]')?.getAttribute('href') ??
    null;

  it('arriver sur l’adresse canonique ouvre la fiche, titre et canonique posés', async () => {
    await arrive(CANONICAL);
    expect(address.open()).toBe(ITEM.sku);
    expect(router.url).toBe(CANONICAL);
    expect(TestBed.inject(Title).getTitle()).toContain(ITEM.name);
    expect(canonicalHref()).toMatch(new RegExp(`${CANONICAL}$`));
  });

  it('arriver avec un rayon et #pro les garde sous la fiche', async () => {
    await arrive(`${CANONICAL}?rayon=cat_pains#pro`);
    expect(address.open()).toBe(ITEM.sku);
    expect(router.url).toBe(`${CANONICAL}?rayon=cat_pains#pro`);
  });

  it('ouvrir une fiche depuis la grille pousse son adresse, rayon gardé', async () => {
    await arrive('/boutique?rayon=cat_pains');
    const navigate = vi.spyOn(router, 'navigateByUrl');
    address.show(ITEM.sku);
    expect(address.open()).toBe(ITEM.sku);
    await settle();
    expect(router.url).toBe(`${CANONICAL}?rayon=cat_pains`);
    expect(navigate.mock.calls[0]?.[1]?.replaceUrl).toBe(false);
  });

  it('fermer une fiche ouverte ici revient en arrière dans l’historique', async () => {
    await arrive('/boutique');
    address.show(ITEM.sku);
    await settle();
    const back = vi.spyOn(TestBed.inject(Location), 'back');
    address.close();
    expect(address.open()).toBeNull();
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('fermer une fiche arrivée de l’extérieur rend la grille sans quitter le site', async () => {
    await arrive(`${CANONICAL}?rayon=cat_pains`);
    const back = vi.spyOn(TestBed.inject(Location), 'back');
    address.close();
    await settle();
    expect(back).not.toHaveBeenCalled();
    expect(router.url).toBe('/boutique?rayon=cat_pains');
    expect(TestBed.inject(Title).getTitle()).toBe('Boutique — La Folie Coffee');
  });

  it('le retour du navigateur (l’adresse redevient la grille) ferme la fiche', async () => {
    await arrive(CANONICAL);
    await router.navigateByUrl('/boutique');
    await settle();
    expect(address.open()).toBeNull();
  });

  /** L'alias de fiche (`plan-defaut-sous-sa-reference.md`, § 5) : à vie, sans entrée d'historique. */
  it('une ancienne référence ouvre l’article qu’elle désigne, adresse remplacée', async () => {
    const navigate = vi.spyOn(Router.prototype, 'navigateByUrl');
    await arrive('/boutique/article/OLD-001', {
      ...TEST_CATALOGUE,
      saleSkuAliases: [{ aliasSku: 'OLD-001', targetSku: ITEM.sku }],
    });
    expect(router.url).toBe(CANONICAL);
    expect(address.open()).toBe(ITEM.sku);

    const redirect = navigate.mock.calls.find(([target]) => String(target) === CANONICAL);
    expect(redirect?.[1]?.replaceUrl).toBe(true);
    navigate.mockRestore();
  });

  it('un article inconnu ou hors audience rend « absent », sans fiche, non indexé', async () => {
    await arrive('/boutique/article/INCONNU-404');
    expect(address.open()).toBeNull();
    expect(address.missing()).toBe(true);
    expect(
      TestBed.inject(DOCUMENT).head.querySelector('meta[name="robots"]')?.getAttribute('content'),
    ).toBe('noindex');

    address.close();
    await settle();
    expect(address.missing()).toBe(false);
    expect(router.url).toBe('/boutique');
  });
});
