import type { FeatureLevelsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { FeatureLevelResolver } from "../feature-level.resolver.js";
import { GetMyFeatureLevelsQuery } from "./get-my-feature-levels.query.js";

/**
 * Sert `GET /feature-access/mine` : les niveaux de CETTE personne, calculés par
 * la même résolution que la garde — l'écran ne peut donc pas promettre ce que
 * le serveur refuserait.
 *
 * 🔴 La réponse a **la même forme** que `GET /feature-access` : des niveaux, et
 * rien d'autre. Elle ne dit jamais « vous êtes exempté » ; un testeur voit une
 * boutique ouverte, pas une liste.
 */
@QueryHandler(GetMyFeatureLevelsQuery)
export class GetMyFeatureLevelsHandler implements IQueryHandler<
  GetMyFeatureLevelsQuery,
  FeatureLevelsView
> {
  constructor(private readonly resolver: FeatureLevelResolver) {}

  async execute(query: GetMyFeatureLevelsQuery): Promise<FeatureLevelsView> {
    const [shop, orders, invoices, desktopMenu, customerMandate] = await Promise.all([
      this.resolver.levelFor("shop", query.subject),
      this.resolver.levelFor("orders", query.subject),
      this.resolver.levelFor("invoices", query.subject),
      this.resolver.levelFor("desktopMenu", query.subject),
      this.resolver.levelFor("customerMandate", query.subject),
    ]);
    return { shop, orders, invoices, desktopMenu, customerMandate };
  }
}
