import { Global, Module } from "@nestjs/common";

import { ParticularNoShowCountsReader } from "../lafoliecoffee/orders/domain/ports/particular-no-show-counts.reader.js";
import { PrismaParticularNoShowCountsReader } from "../lafoliecoffee/orders/infrastructure/prisma-particular-no-show-counts.reader.js";

/**
 * **Le compte des commandes non retirées, relié à la recherche des
 * particuliers** (`commande-particulier-reglee-en-boutique.md`, § 5 bis).
 *
 * Les commandes DÉCLARENT et IMPLÉMENTENT la lecture — elles seules savent ce
 * qu'est une commande non retirée —, le compte la compose. `@Global` parce que
 * `OrdersModule` importe déjà `AccountModule` : le compte ne peut pas
 * l'importer en retour sans cycle (même figure qu'`AccountFeatureLevelsModule`).
 */
@Global()
@Module({
  providers: [
    { provide: ParticularNoShowCountsReader, useClass: PrismaParticularNoShowCountsReader },
  ],
  exports: [ParticularNoShowCountsReader],
})
export class ParticularNoShowCountsModule {}
