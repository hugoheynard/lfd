import type { MyCollectionMeansView } from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { GetMyCompanyCollectionMeansQuery } from "../application/queries/get-my-company-collection-means.query.js";

/**
 * Surface **client** du moyen d'encaissement : la carte « Paiement » de
 * `/mon-compte`. Le mur vit dans le handler.
 */
@Controller("companies")
export class CompanyCollectionMeansController {
  constructor(private readonly queries: QueryBus) {}

  /** Prélèvement ou virement — jamais les coordonnées de l'entité. */
  @Get(":companyId/collection-means")
  read(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
  ): Promise<MyCollectionMeansView> {
    return this.queries.execute<GetMyCompanyCollectionMeansQuery, MyCollectionMeansView>(
      new GetMyCompanyCollectionMeansQuery(user.userId, companyId),
    );
  }
}
