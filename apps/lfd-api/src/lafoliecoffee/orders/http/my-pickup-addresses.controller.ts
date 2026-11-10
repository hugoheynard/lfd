import type { AudiencePickupAddressView } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { ActingCompany } from "../../../platform/auth/acting-company.decorator.js";
import { ListMyShopPickupsQuery } from "../application/queries/list-my-shop-pickups.query.js";

/**
 * **Les points de retrait d'un client reconnu** — ceux de SA clientèle
 * (Hugo, 2026-10-15) : un pro d'une société active voit les sites ouverts
 * aux pros, l'espace perso ceux des particuliers.
 *
 * Chaque point porte UNE remise, celle de l'audience établie de l'espace (pro
 * actif, pro en attente, particulier inscrit) — jamais celles des autres
 * clientèles (Hugo, 2026-10-31 : « chaque audience n'a le droit qu'à son
 * information »). Les trois restent sur `GET /admin/pickup-addresses`.
 *
 * Un contrôleur à part, comme `MyStorefrontController` : la liste publique
 * (`PickupAddressesController`) est `@Public()` au niveau de la classe, et
 * celle-ci est murée. La société vient du contexte de la requête (l'espace
 * choisi), jamais de l'URL : la boutique la relit au changement d'espace.
 */
@Controller("pickup-addresses")
export class MyPickupAddressesController {
  constructor(private readonly queries: QueryBus) {}

  @Get("mine")
  list(@ActingCompany() companyId: string | null): Promise<readonly AudiencePickupAddressView[]> {
    return this.queries.execute<ListMyShopPickupsQuery, readonly AudiencePickupAddressView[]>(
      new ListMyShopPickupsQuery(companyId),
    );
  }
}
