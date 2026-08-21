import { Injectable } from "@nestjs/common";

import { TvaRegimeRepository } from "../../../commerce/domain/ports/tva-regime.repository.js";
import {
  CatalogueReader,
  type CategoryTvaTags,
  type ChannelCategory,
} from "../domain/ports/catalogue-reader.js";
import { CategoryRepository } from "../../category/domain/ports/category.repository.js";
import {
  ProductRepository,
  type ProductRecord,
} from "../../product/domain/ports/product.repository.js";

/**
 * Implémentation du port de lecture. Elle s'appuie sur les dépôts du catalogue —
 * c'est-à-dire qu'elle reste **à l'intérieur** du module, là où lire ces tables est
 * légitime — et compose avec le port `TvaRegimeRepository` (commerce, déjà importé par
 * le module) pour résoudre le tag de collection d'une catégorie. L'adaptateur Shopify
 * ne voit que le résultat (ADR-13).
 */
@Injectable()
export class PrismaCatalogueReader extends CatalogueReader {
  constructor(
    private readonly products: ProductRepository,
    private readonly categories: CategoryRepository,
    private readonly regimes: TvaRegimeRepository,
  ) {
    super();
  }

  /**
   * Un produit archivé n'a rien à faire sur un canal de vente.
   *
   * Le port d'écriture rend des agrégats ; le lecteur en rend l'instantané —
   * une projection n'a rien à muter, et lui tendre des méthodes serait
   * l'inviter à le faire.
   */
  async publishable(): Promise<ProductRecord[]> {
    const all = await this.products.listAll();
    return all.filter((product) => product.status !== "archived").map((p) => p.snapshot());
  }

  async byIds(ids: readonly string[]): Promise<ProductRecord[]> {
    const wanted = new Set(ids);
    const all = await this.products.listAll();
    return all.filter((product) => wanted.has(product.id)).map((p) => p.snapshot());
  }

  async tvaTags(categoryId: string): Promise<CategoryTvaTags> {
    const category = await this.categories.findById(categoryId);
    if (category === null) {
      return { emporter: null, surPlace: null };
    }
    return {
      emporter: await this.tagOf(category.emporterTvaId),
      surPlace: await this.tagOf(category.surPlaceTvaId),
    };
  }

  /**
   * Les familles vivantes, avec leur taux « à emporter » résolu.
   *
   * Les régimes sont lus **une fois** et indexés : résoudre famille par famille
   * ferait N+1 requêtes pour une table qui tient en quelques lignes.
   */
  async channelCategories(): Promise<ChannelCategory[]> {
    const [categories, regimes] = await Promise.all([
      this.categories.listAll(),
      this.regimes.listAll(),
    ]);
    const percentById = new Map(regimes.map((regime) => [regime.id, regime.percent]));

    return categories
      .filter((category) => !category.isArchived)
      .map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        parentId: category.parentId,
        position: category.position,
        emporterVatPercent:
          category.emporterTvaId === null
            ? null
            : (percentById.get(category.emporterTvaId) ?? null),
      }));
  }

  /** Un id de régime → son tag `tva-*`, ou `null` si non réglé / introuvable. */
  private async tagOf(regimeId: string | null): Promise<string | null> {
    if (regimeId === null) {
      return null;
    }
    const regime = await this.regimes.findById(regimeId);
    return regime?.tag ?? null;
  }
}
