import { Global, Module } from "@nestjs/common";

import { PrismaShelfDrawsReader } from "../lafoliecoffee/orders/infrastructure/prisma-shelf-draws.reader.js";
import { ShelfDrawsReader } from "../lafoliecoffee/resupply/domain/shelf-draws.reader.js";

/**
 * **Les prélèvements de la vitrine, reliés** (le stock du jour décompté, L2 —
 * `documentation/limites-de-commande/jour-meme-sur-stock.md`). Le réassort
 * DÉCLARE `ShelfDrawsReader` ; les commandes l'IMPLÉMENTENT, parce qu'elles
 * possèdent les lignes (`lint:prisma-model-ownership`).
 *
 * Câblé ici depuis le 2026-11-03 (audit final du réassort) : il l'était
 * dans `ResupplyModule`, qui importait ainsi un adaptateur d'`orders`. Le
 * câbler dans `OrdersModule` ferait un cycle — `OrdersModule` importe
 * `ResupplyModule` pour le reste du jour (`DayShelfStock`, lot L4) —, d'où
 * la racine de composition, comme les autres liaisons d'un port à son
 * adaptateur d'un autre contexte.
 */
@Global()
@Module({
  providers: [{ provide: ShelfDrawsReader, useClass: PrismaShelfDrawsReader }],
  exports: [ShelfDrawsReader],
})
export class ShelfDrawsFeedModule {}
