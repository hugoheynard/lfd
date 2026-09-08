import type { ShopCatalogueView } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { ActingCompany } from "../../../platform/auth/acting-company.decorator.js";
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
 * 🔴 **Aucun identifiant de société dans l'URL.** Il vient du contexte de la
 * requête, résolu par le guard depuis les rattachements du demandeur
 * (`resolve-company.ts`). Le sondage est donc **inexprimable** : il n'y a pas de
 * paramètre à deviner. C'est un cran au-dessus du mur qui vérifie — et la
 * première version de cette route le vérifiait, ce qui marchait, mais laissait
 * exister la question.
 *
 * Sans société résolue — visiteur rattaché à rien, ou personne rattachée à
 * plusieurs sans avoir déclaré laquelle — la route rend le **tarif catalogue**,
 * comme la vitrine publique. C'est la réponse honnête à « je ne sais pas encore
 * pour qui » : ni refus, ni prix de quelqu'un d'autre.
 */
@Controller("shop/catalogue")
export class MyShopCatalogueController {
  constructor(private readonly queries: QueryBus) {}

  /** Le catalogue vendable, résolu à la mercuriale de la société courante. */
  @Get("mine")
  read(@ActingCompany() companyId: string | null): Promise<ShopCatalogueView> {
    return this.queries.execute<ReadMyShopCatalogueQuery, ShopCatalogueView>(
      new ReadMyShopCatalogueQuery(companyId),
    );
  }
}
