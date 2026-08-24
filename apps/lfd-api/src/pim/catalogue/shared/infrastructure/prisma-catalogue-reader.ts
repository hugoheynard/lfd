import { Injectable } from "@nestjs/common";

import type { SalesChannels } from "../domain/value-objects/sales-channels.js";
import { effectiveVat } from "../domain/value-objects/sales-context.js";
import { CategoryNotFoundError } from "../../category/domain/errors/category-errors.js";

import { VatRateRepository } from "../../../commerce/domain/ports/vat-rate.repository.js";
import {
  CatalogueReader,
  type CategoryVatPercents,
  type ChannelCategory,
} from "../domain/ports/catalogue-reader.js";
import { CategoryRepository } from "../../category/domain/ports/category.repository.js";
import {
  EditorialReader,
  type ProductEditorialView,
} from "../../product/domain/ports/editorial-reader.js";
import {
  ProductRepository,
  type ProductRecord,
} from "../../product/domain/ports/product.repository.js";

/**
 * Implémentation du port de lecture. Elle s'appuie sur les dépôts du catalogue —
 * c'est-à-dire qu'elle reste **à l'intérieur** du module, là où lire ces tables est
 * légitime — et compose avec le port `VatRateRepository` (commerce, déjà importé par
 * le module) pour résoudre le tag de collection d'une catégorie. L'adaptateur Shopify
 * ne voit que le résultat (ADR-13).
 */
@Injectable()
export class PrismaCatalogueReader extends CatalogueReader {
  constructor(
    private readonly products: ProductRepository,
    private readonly categories: CategoryRepository,
    private readonly rates: VatRateRepository,
    private readonly editorialReader: EditorialReader,
  ) {
    super();
  }

  /** Délégué au lecteur éditorial : le canal ne connaît qu'un port, celui-ci. */
  editorials(productIds: readonly string[]): Promise<ReadonlyMap<string, ProductEditorialView>> {
    return this.editorialReader.findByProducts(productIds);
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

  /**
   * Une famille INCONNUE n'est pas une famille non réglée.
   *
   * Elle rendait une carte vide — exactement ce que rend une famille bien
   * réelle dont personne n'a réglé la TVA. Deux causes, deux gestes (réparer un
   * rattachement / régler un taux), un seul symptôme. Le refus est donc
   * explicite ; ses appelants l'attrapent et le rendent visible plutôt que de
   * tomber.
   */
  async vatPercents(
    products: readonly ProductRecord[],
  ): Promise<ReadonlyMap<string, CategoryVatPercents>> {
    const percentById = await this.percentIndex();
    const resolved = new Map<string, CategoryVatPercents>();
    // Les familles sont lues UNE fois chacune, même quand cent produits les
    // partagent : c'est le cas normal d'un catalogue.
    const families = new Map<string, Readonly<Record<string, string>>>();

    for (const product of products) {
      let family = families.get(product.categoryId);
      if (family === undefined) {
        const category = await this.categories.findById(product.categoryId);
        if (category === null) {
          throw new CategoryNotFoundError(product.categoryId);
        }
        family = category.vatByContext;
        families.set(product.categoryId, family);
      }
      resolved.set(
        product.id,
        this.resolve(effectiveVat(family, product.vatByContext), percentById),
      );
    }
    return resolved;
  }

  /**
   * Les canaux effectifs, produit par produit. Les familles sont lues une fois
   * chacune, même quand cent produits les partagent.
   */
  async effectiveChannels(
    products: readonly ProductRecord[],
  ): Promise<ReadonlyMap<string, SalesChannels>> {
    const families = new Map<string, SalesChannels>();
    const resolved = new Map<string, SalesChannels>();

    for (const product of products) {
      let family = families.get(product.categoryId);
      if (family === undefined) {
        const category = await this.categories.findById(product.categoryId);
        if (category === null) {
          throw new CategoryNotFoundError(product.categoryId);
        }
        family = category.channelPreset;
        families.set(product.categoryId, family);
      }
      resolved.set(product.id, product.channelOverride ?? family);
    }
    return resolved;
  }

  /**
   * Les familles vivantes, avec leurs taux résolus — « à emporter » **et** B2B.
   *
   * Les taux sont lus **une fois** et indexés : résoudre famille par famille
   * ferait N+1 requêtes pour une table qui tient en quelques lignes.
   */
  async channelCategories(): Promise<ChannelCategory[]> {
    const [categories, percentById] = await Promise.all([
      this.categories.listAll(),
      this.percentIndex(),
    ]);

    return categories
      .filter((category) => !category.isArchived)
      .map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        parentId: category.parentId,
        position: category.position,
        vatByContext: this.resolve(category.vatByContext, percentById),
      }));
  }

  /**
   * Les taux, indexés **une fois**. Résoudre famille par famille ferait N+1
   * requêtes pour une table qui tient en quelques lignes.
   */
  private async percentIndex(): Promise<ReadonlyMap<string, number>> {
    const rates = await this.rates.listAll();
    return new Map(rates.map((rate) => [rate.id, rate.percent]));
  }

  /**
   * Les identifiants de taux d'une famille → leurs pourcentages.
   *
   * Un identifiant qui ne désigne aucun taux ne produit **pas de clé** : le
   * contexte est alors non réglé, comme s'il n'avait jamais été renseigné. C'est
   * le seul choix sûr — inventer un taux ici facturerait un client.
   */
  private resolve(
    vatByContext: Readonly<Record<string, string>>,
    percentById: ReadonlyMap<string, number>,
  ): CategoryVatPercents {
    const percents: Record<string, number> = {};
    for (const [contextKey, rateId] of Object.entries(vatByContext)) {
      const percent = percentById.get(rateId);
      if (percent !== undefined) {
        percents[contextKey] = percent;
      }
    }
    return percents;
  }
}
