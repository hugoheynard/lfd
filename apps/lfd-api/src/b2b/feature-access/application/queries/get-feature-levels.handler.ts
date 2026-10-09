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
    // Une seule clé depuis le 2026-10-09 : `shop`, `orders`, `invoices`,
    // `desktopMenu` et `publicDelivery` ont été retirées du catalogue.
    return { customerMandate: await this.resolver.levelFor("customerMandate", null) };
  }
}
