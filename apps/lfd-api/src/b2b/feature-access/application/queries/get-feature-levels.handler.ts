import type { FeatureLevelsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { FeatureLevelResolver } from "../feature-level.resolver.js";
import { GetFeatureLevelsQuery } from "./get-feature-levels.query.js";

/**
 * Sert `GET /feature-access`. Le sujet est `null` : une route publique n'a pas
 * de `Principal`, donc pas d'exemption — et la réponse ne peut rien dire d'une
 * adresse.
 *
 * Une clé ajoutée au catalogue fait échouer la compilation ici : `FeatureLevelsView`
 * est indexé par le catalogue, et c'est ce qui empêche une clé d'être oubliée.
 */
@QueryHandler(GetFeatureLevelsQuery)
export class GetFeatureLevelsHandler implements IQueryHandler<
  GetFeatureLevelsQuery,
  FeatureLevelsView
> {
  constructor(private readonly resolver: FeatureLevelResolver) {}

  async execute(): Promise<FeatureLevelsView> {
    const [shop, orders, invoices, desktopMenu] = await Promise.all([
      this.resolver.levelFor("shop", null),
      this.resolver.levelFor("orders", null),
      this.resolver.levelFor("invoices", null),
      this.resolver.levelFor("desktopMenu", null),
    ]);
    return { shop, orders, invoices, desktopMenu };
  }
}
