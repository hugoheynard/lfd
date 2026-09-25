import type { PublicStorefrontPageView } from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { ActingCompany } from "../../../platform/auth/acting-company.decorator.js";
import { GetPublicStorefrontPageQuery } from "../application/get-public-storefront-page.query.js";

/**
 * **La vitrine d'un client reconnu** — la même page que
 * {@link StorefrontController}, lue pour SA clientèle (D7, D11 de
 * `architecture-operations-datees.md`) : une société résolue ⇒ `pro`, et les
 * annonces d'une opération réservée aux pros s'y allument.
 *
 * Un contrôleur à part, comme `MyShopCatalogueController` : l'autre est
 * `@Public()` au niveau de la classe, et celui-ci est muré. La société vient du
 * contexte de la requête, jamais de l'URL. Sans société résolue (espace
 * « perso », rattachement ambigu), la page est celle d'un visiteur.
 */
@Controller("shop/storefront")
export class MyStorefrontController {
  constructor(private readonly queries: QueryBus) {}

  @Get(":shelfKey/mine")
  page(
    @Param("shelfKey") shelfKey: string,
    @ActingCompany() companyId: string | null,
  ): Promise<PublicStorefrontPageView> {
    return this.queries.execute<GetPublicStorefrontPageQuery, PublicStorefrontPageView>(
      new GetPublicStorefrontPageQuery(shelfKey, companyId),
    );
  }
}
