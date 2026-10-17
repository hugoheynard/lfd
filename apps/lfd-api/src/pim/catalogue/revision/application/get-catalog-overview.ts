import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { CatalogOverviewView } from "@lfd/pim-contracts";

import { CatalogRevisionSource } from "../domain/ports/catalog-revision.source.js";

export class GetCatalogOverviewQuery {}

/**
 * **Où en est le catalogue** : ce qu'il contient et ce qui est validé.
 *
 * Il comparait aussi le catalogue à la dernière ancre **publiée** (« N
 * changements depuis la dernière publication »). Ce repère comptait ce que le
 * push n'avait pas encore envoyé ; le push parti (X2), tout part à
 * l'enregistrement par les faits, et le repère a été retiré le 2026-10-17
 * (Hugo). Les révisions, elles, restent — leur écran les liste et les compare.
 */
@QueryHandler(GetCatalogOverviewQuery)
export class GetCatalogOverviewHandler implements IQueryHandler<
  GetCatalogOverviewQuery,
  CatalogOverviewView
> {
  constructor(private readonly source: CatalogRevisionSource) {}

  async execute(): Promise<CatalogOverviewView> {
    const items = await this.source.snapshotItems();

    // Par FICHE et non par article : un produit à trois déclinaisons est un
    // produit. Compter les articles ici gonflerait les statuts d'un facteur qui
    // dépend du conditionnement.
    const products = new Map(items.map((item) => [item.productId, item]));
    const published = [...products.values()].filter((item) => item.status === "published").length;
    const signed = [...products.values()].filter((item) => item.readyBy !== null).length;

    return {
      products: products.size,
      published,
      drafts: products.size - published,
      signed,
      articles: items.length,
    };
  }
}
