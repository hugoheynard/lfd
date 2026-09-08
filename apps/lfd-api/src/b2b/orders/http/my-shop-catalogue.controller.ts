import type { ShopCatalogueView } from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { ReadMyShopCatalogueQuery } from "../application/queries/read-my-shop-catalogue.js";

/**
 * **La vitrine d'un client reconnu**, à ses prix.
 *
 * Un contrôleur à part de `ShopCatalogueController`, qui est `@Public()` au
 * niveau de la classe : le second chemin est **muré**, et les deux ne peuvent
 * pas partager une classe dont le défaut est l'ouverture. C'est aussi ce que les
 * documents annonçaient — « ce sera un second chemin, pas une modification de
 * celui-ci ».
 *
 * La société est **dans l'URL**, jamais déduite du `Principal` : une personne
 * peut n'être rattachée à aucune société ou à plusieurs, et en choisir une
 * d'office serait le raccourci qui fuit. Le handler la vérifie contre les
 * rattachements — sans quoi n'importe qui sonderait la mercuriale d'un
 * concurrent en devinant son identifiant.
 *
 * Sous `companies/:companyId/…`, comme les adresses et les pièces : c'est la
 * forme que prend une lecture murée par tenant dans ce dépôt.
 */
@Controller("companies")
export class MyShopCatalogueController {
  constructor(private readonly queries: QueryBus) {}

  /** Le catalogue vendable, résolu à la mercuriale de cette société. */
  @Get(":companyId/shop-catalogue")
  read(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
  ): Promise<ShopCatalogueView> {
    return this.queries.execute<ReadMyShopCatalogueQuery, ShopCatalogueView>(
      new ReadMyShopCatalogueQuery(user.userId, companyId),
    );
  }
}
