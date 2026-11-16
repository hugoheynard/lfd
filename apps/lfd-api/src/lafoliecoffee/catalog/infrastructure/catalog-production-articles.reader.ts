import type { CatalogFamilyView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  type ProductionArticle,
  ProductionArticlesReader,
} from "../../../production/channels/commerce/index.js";
import { familyView } from "../domain/catalog-family.js";
import { staffViewer } from "../domain/catalog-viewer.js";
import { isShownAsTile, shopItemName, shopSkuOf } from "../domain/shop-sku.js";
import { FLAT_LINEAGE, lineageFrom, type Lineage } from "./catalog-family-lineage.js";
import { timeCatalogueRead } from "./catalogue-read-timing.js";
import { type ItemRow, itemInclude, servedItem } from "./prisma-catalog.reader.js";
import { STILL_SOLD } from "./sellable-filter.js";

/** Les deux clientèles : un article vendable l'est à au moins l'une. */
const AUDIENCE_VIEWERS = [staffViewer("pro"), staffViewer("public")] as const;

/**
 * **Le produit et le rayon de ce que le fournil fabrique**, lus dans le miroir
 * (`catalog_items`) **sans les filtres de vente** (plan
 * `fournil/plan-postes-du-fournil.md`, § 3.4).
 *
 * Toute déclinaison est rendue, masquée, sans taux ou hors vignette comprise :
 * le fournil range des lignes déjà commandées, et un poste s'attache à leur
 * produit. Seule une déclinaison **retirée** est écartée (`STILL_SOLD`).
 *
 * `sellable` suit la règle même de la vente, sans en écrire une copie : la
 * déclinaison paraît au rayon (`isShownAsTile`, la jumelle de
 * `soldUnderShopSkus`) et `servedItem` la sert à au moins une clientèle —
 * masquages, réservations, taux et prix compris.
 *
 * La famille passe par la lignée puis `familyView`, comme celle de
 * `listByShopSkus` : sans la lignée, une sous-catégorie se rangerait sous
 * elle-même. Lu sur la base et non sur l'instantané du catalogue : la page
 * Postes et la fiche d'atelier sont hors du devis et du rayon
 * (`lint:catalogue-door`, `ADMITTED`).
 *
 * Toute panne remonte : c'est à l'appelant de le dire.
 */
@Injectable()
export class CatalogProductionArticlesReader extends ProductionArticlesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async articlesOf(skus: readonly string[]): Promise<ReadonlyMap<string, ProductionArticle>> {
    if (skus.length === 0) {
      return new Map();
    }
    const articles = await this.read({ sku: { in: [...skus] } });
    return new Map(articles.map((article) => [article.sku, article]));
  }

  allArticles(): Promise<readonly ProductionArticle[]> {
    return this.read({});
  }

  private async read(where: {
    readonly sku?: { readonly in: string[] };
  }): Promise<ProductionArticle[]> {
    const rows = await timeCatalogueRead(() =>
      this.prisma.catalogItem.findMany({
        where: { ...where, ...STILL_SOLD },
        include: itemInclude(staffViewer("pro")),
        orderBy: [{ category: { position: "asc" } }, { position: "asc" }, { sku: "asc" }],
      }),
    );
    const lineage = await this.lineage(rows);
    return rows.map((row) => articleOf(row, lineage));
  }

  /** La lignée des familles lues ; le miroir des familles n'est lu que s'il a une hiérarchie. */
  private async lineage(rows: readonly ItemRow[]): Promise<Lineage> {
    if (rows.every((row) => row.category.parentId === null)) {
      return FLAT_LINEAGE;
    }
    const families = await timeCatalogueRead(() =>
      this.prisma.catalogCategory.findMany({
        select: { id: true, parentId: true, name: true, position: true, nameTranslations: true },
      }),
    );
    return lineageFrom(families);
  }
}

function articleOf(row: ItemRow, lineage: Lineage): ProductionArticle {
  return {
    sku: shopSkuOf(row),
    productSku: row.productSku,
    productName: row.productName,
    variantName: shopItemName(row.name),
    family: familyOf(row, lineage),
    sellable:
      isShownAsTile(row) &&
      AUDIENCE_VIEWERS.some((viewer) => servedItem(row, viewer, lineage) !== null),
  };
}

function familyOf(row: ItemRow, lineage: Lineage): CatalogFamilyView {
  const { path, ancestors } = lineage(row.category.id);
  return familyView({
    id: row.category.id,
    name: row.category.name,
    position: row.category.position,
    slug: row.category.slug,
    path,
    ...(ancestors.length === 0 ? {} : { ancestors }),
  });
}
