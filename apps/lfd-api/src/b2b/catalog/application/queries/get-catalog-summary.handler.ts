import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { CatalogAdminItemView, CatalogSummaryView } from "@lfd/contracts";

import { CatalogAdminReader } from "../../domain/ports/catalog-admin.reader.js";
import { GetCatalogSummaryQuery } from "./get-catalog-summary.query.js";

/**
 * Les trois nombres que le tableau de bord affiche.
 *
 * Comptés **en mémoire** sur la liste déjà lue, et non par trois `count` SQL.
 * Trois requêtes seraient plus « propres » et donneraient trois photographies
 * d'instants différents : un article qui gagne son taux entre la première et la
 * troisième se compterait deux fois, ou zéro. Sur quelques centaines de lignes,
 * une lecture cohérente vaut mieux que trois agrégats concurrents.
 *
 * 🔴 `withoutVatRate` est le seul des trois qui appelle un geste. Un article sans
 * régime de TVA n'est pas masqué et n'est pas vendable pour autant : le lecteur
 * de la boutique l'écarte plutôt que d'inventer 5,5 %. Il disparaît donc de la
 * vente sans que rien ne le dise — c'est exactement ce que ce compteur existe
 * pour dire.
 */
@QueryHandler(GetCatalogSummaryQuery)
export class GetCatalogSummaryHandler implements IQueryHandler<
  GetCatalogSummaryQuery,
  CatalogSummaryView
> {
  constructor(private readonly catalog: CatalogAdminReader) {}

  async execute(): Promise<CatalogSummaryView> {
    const items = await this.catalog.list();
    return {
      // « En vente » exige les DEUX conditions. Ne compter que `!isHidden`
      // annoncerait en vente des articles que la boutique n'affiche pas.
      onSale: items.filter(sellable).length,
      withoutVatRate: items.filter((item) => item.vatRatePercent === null).length,
      hidden: items.filter((item) => item.isHidden).length,
    };
  }
}

function sellable(item: CatalogAdminItemView): boolean {
  return !item.isHidden && item.vatRatePercent !== null;
}
