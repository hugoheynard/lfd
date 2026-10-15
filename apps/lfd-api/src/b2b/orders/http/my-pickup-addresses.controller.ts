import type { PickupAddressView } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { ActingCompany } from "../../../platform/auth/acting-company.decorator.js";
import { ListCustomerPickupsQuery } from "../application/queries/list-customer-pickups.query.js";

/**
 * **Les points de retrait d'un client reconnu** — ceux de SA clientèle
 * (Hugo, 2026-10-15) : un pro d'une société active voit les sites ouverts
 * aux pros, l'espace perso ceux des particuliers.
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
  list(@ActingCompany() companyId: string | null): Promise<readonly PickupAddressView[]> {
    return this.queries.execute<ListCustomerPickupsQuery, readonly PickupAddressView[]>(
      new ListCustomerPickupsQuery(companyId),
    );
  }
}
