import { Module } from "@nestjs/common";

import { PriceRuleReader } from "./domain/ports/price-rule.reader.js";
import { PrismaPriceRuleReader } from "./infrastructure/prisma-price-rule.reader.js";

/**
 * Contexte **prix** : les règles tarifaires et leur résolution.
 *
 * Il n'exporte qu'un port de **lecture**. La fonction `resolvePrice` n'est pas
 * un provider et ne le sera jamais : c'est une fonction pure, elle s'importe.
 * En faire un service injectable donnerait l'illusion qu'elle a des
 * dépendances, et rendrait sa mise sous test plus lourde que son écriture.
 */
@Module({
  providers: [{ provide: PriceRuleReader, useClass: PrismaPriceRuleReader }],
  exports: [PriceRuleReader],
})
export class PricingModule {}
