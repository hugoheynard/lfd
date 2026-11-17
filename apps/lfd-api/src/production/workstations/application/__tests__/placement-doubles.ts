import type { CatalogFamilyView } from "@lfd/contracts";

import {
  type ProductionArticle,
  ProductionArticlesReader,
} from "../../../channels/commerce/index.js";
import { PlacedProducts } from "../../domain/ports/placed-products.js";
import { WorkstationMapVersion } from "../../domain/ports/workstation-map-version.js";
import {
  type PlacedWorkstation,
  WorkstationOfProducts,
  type WorkstationsOfProducts,
} from "../../domain/ports/workstation-of-products.js";

/** Un article du miroir : sa déclinaison, son produit, son rayon. */
export function article(
  sku: string,
  productSku: string,
  family: CatalogFamilyView,
): ProductionArticle {
  return { sku, productSku, productName: null, variantName: sku, family, sellable: true };
}

/** Le commerce, qui connaît ces articles et eux seuls. */
export class FixedProductionArticles extends ProductionArticlesReader {
  readonly asked: (readonly string[])[] = [];

  constructor(private readonly articles: readonly ProductionArticle[]) {
    super();
  }

  articlesOf(skus: readonly string[]): Promise<ReadonlyMap<string, ProductionArticle>> {
    this.asked.push(skus);
    const wanted = new Set(skus);
    return Promise.resolve(
      new Map(this.articles.filter((item) => wanted.has(item.sku)).map((item) => [item.sku, item])),
    );
  }

  allArticles(): Promise<readonly ProductionArticle[]> {
    return Promise.resolve(this.articles);
  }
}

/** Le commerce injoignable : la lecture des articles lève, et compte ses appels. */
export class FailingProductionArticles extends ProductionArticlesReader {
  calls = 0;

  articlesOf(): Promise<ReadonlyMap<string, ProductionArticle>> {
    this.calls += 1;
    return Promise.reject(new Error("commerce injoignable"));
  }

  allArticles(): Promise<readonly ProductionArticle[]> {
    this.calls += 1;
    return Promise.reject(new Error("commerce injoignable"));
  }
}

/**
 * Le commerce qui connaît ces rayons, par SKU : chaque SKU devient un article
 * de son propre produit. Pour les suites qui ne rangent que par rayon.
 */
export function shelfArticles(
  shelves: ReadonlyMap<string, CatalogFamilyView>,
): FixedProductionArticles {
  return new FixedProductionArticles(
    [...shelves].map(([sku, family]) => article(sku, sku, family)),
  );
}

/** Les postes, dans l'ordre reçu, et le poste de quelques produits. */
export class FixedWorkstationOfProducts extends WorkstationOfProducts {
  readonly asked: (readonly string[])[] = [];

  constructor(
    private readonly workstations: readonly PlacedWorkstation[],
    private readonly placements: ReadonlyMap<string, string>,
  ) {
    super();
  }

  workstationsOf(productSkus: readonly string[]): Promise<WorkstationsOfProducts> {
    this.asked.push(productSkus);
    const byProduct = new Map(
      [...this.placements].filter(([product]) => productSkus.includes(product)),
    );
    return Promise.resolve({ workstations: this.workstations, byProduct });
  }
}

/** Les postes en panne : la lecture lève. */
export class FailingWorkstationOfProducts extends WorkstationOfProducts {
  workstationsOf(): Promise<WorkstationsOfProducts> {
    return Promise.reject(new Error("tables des postes injoignables"));
  }
}

/**
 * Une lecture des postes qui échoue si on l'appelle : le mode boutique ne
 * doit jamais lire les postes.
 */
export class UnreadWorkstationOfProducts extends WorkstationOfProducts {
  calls = 0;

  workstationsOf(): Promise<WorkstationsOfProducts> {
    this.calls += 1;
    return Promise.reject(new Error("le mode boutique a lu les postes"));
  }
}

/**
 * Les deux ports que le rangement par poste lit — les articles, puis les
 * postes —, à étaler dans le constructeur de la fiche ou du dossier. Sans
 * argument : rien n'est connu, et les postes ne doivent pas être lus.
 */
export function placementPorts(
  articles: readonly ProductionArticle[] = [],
  workstations: WorkstationOfProducts = new UnreadWorkstationOfProducts(),
): readonly [ProductionArticlesReader, WorkstationOfProducts] {
  return [new FixedProductionArticles(articles), workstations];
}

/** Combien de produits ont un poste : un nombre fixé. */
export class FixedPlacedProducts extends PlacedProducts {
  constructor(private readonly placed: number) {
    super();
  }

  count(): Promise<number> {
    return Promise.resolve(this.placed);
  }
}

/** Le numéro de la carte, qu'une suite fait monter à la main. */
export class SettableWorkstationMapVersion extends WorkstationMapVersion {
  version = 0;

  versionOf(): Promise<number> {
    return Promise.resolve(this.version);
  }
}
