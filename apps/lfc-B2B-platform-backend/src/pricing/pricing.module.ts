import { Module } from "@nestjs/common";

import { PriceFloorReader } from "./domain/ports/price-floor.reader.js";
import { PriceRuleReader } from "./domain/ports/price-rule.reader.js";
import { PrismaPriceFloorReader } from "./infrastructure/prisma-price-floor.reader.js";
import { PrismaPriceRuleReader } from "./infrastructure/prisma-price-rule.reader.js";

/**
 * Contexte **prix** : les règles tarifaires, leurs planchers, et leur résolution.
 *
 * Il n'exporte que des ports de **lecture**. Les fonctions `resolvePrice` et
 * `resolveFloor` ne sont pas des providers et ne le seront jamais : ce sont des
 * fonctions pures, elles s'importent. En faire des services injectables
 * donnerait l'illusion qu'elles ont des dépendances, et rendrait leur mise sous
 * test plus lourde que leur écriture.
 */
@Module({
  providers: [
    { provide: PriceRuleReader, useClass: PrismaPriceRuleReader },
    { provide: PriceFloorReader, useClass: PrismaPriceFloorReader },
  ],
  exports: [PriceRuleReader, PriceFloorReader],
})
export class PricingModule {}
