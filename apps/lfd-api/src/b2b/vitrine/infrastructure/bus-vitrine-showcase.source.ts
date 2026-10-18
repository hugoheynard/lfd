import type { ContentLocale, ShopCatalogueView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { ReadShopCatalogueQuery } from "../../catalog/application/queries/read-shop-catalogue.js";
import { GetEffectiveShopCopyQuery } from "../../shop-copy/application/queries/get-effective-shop-copy.query.js";
import { VitrineShowcaseSource } from "../domain/ports/vitrine-showcase.source.js";

/**
 * La source de la vitrine, par les lectures NOMMÉES de la boutique : la vue
 * publique (`ReadShopCatalogueQuery`, celle de `GET /shop/catalogue`,
 * résolue à `companyId: null`) et les textes effectifs. Pas de seconde
 * projection : ce que la vitrine reçoit est ce que voit un visiteur (W1′).
 */
@Injectable()
export class BusVitrineShowcaseSource extends VitrineShowcaseSource {
  constructor(private readonly queries: QueryBus) {
    super();
  }

  catalogue(language: ContentLocale): Promise<ShopCatalogueView> {
    return this.queries.execute<ReadShopCatalogueQuery, ShopCatalogueView>(
      new ReadShopCatalogueQuery(language),
    );
  }

  texts(language: ContentLocale): Promise<Readonly<Record<string, string>>> {
    return this.queries.execute<GetEffectiveShopCopyQuery, Readonly<Record<string, string>>>(
      new GetEffectiveShopCopyQuery(language),
    );
  }
}
