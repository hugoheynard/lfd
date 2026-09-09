import { Module } from "@nestjs/common";

import { CanonicalPriceHistoryReader } from "./domain/ports/canonical-price-history.reader.js";
import { PrismaCanonicalPriceHistoryReader } from "./infrastructure/prisma-canonical-price-history.reader.js";

/**
 * **L'historique du tarif canonique, seul dans son module.**
 *
 * ## Pourquoi il ne reste pas dans `CatalogModule`
 *
 * Parce que `CatalogModule` importe `PricerModule` — la vitrine demande ses prix
 * par la porte — et que la porte a besoin de cet historique pour resceller les
 * articles au tarif d'une date passée. Les laisser ensemble ferait un **cycle
 * de modules**, que `lint:import-cycles` refuse : un cycle casse le chargement
 * paresseux à l'exécution, sans que `tsc`, les tests ni la compilation ne s'en
 * plaignent.
 *
 * Ce n'est donc pas un découpage esthétique : c'est la plus petite chose que les
 * deux côtés peuvent partager sans se tenir l'un l'autre. Le lecteur ne dépend
 * que de Prisma, et rien d'autre du catalogue n'a besoin de voyager avec lui.
 *
 * ## Il n'a pas de port d'écriture, et ça se garde ici aussi
 *
 * La trace s'écrit dans la transaction qui sauve l'article, au seul endroit par
 * lequel les deux chemins de changement passent. Un module qui exporterait un
 * écrivain rouvrirait la possibilité d'un prix sans sa trace.
 */
@Module({
  providers: [
    { provide: CanonicalPriceHistoryReader, useClass: PrismaCanonicalPriceHistoryReader },
  ],
  exports: [CanonicalPriceHistoryReader],
})
export class CanonicalPriceHistoryModule {}
