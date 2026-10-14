import { Global, Module } from "@nestjs/common";

import { PrismaDayDispatchProgressReader } from "../delivery/infrastructure/prisma-day-dispatch-progress.reader.js";
import { DayDispatchProgressReader } from "../production/channels/delivery/index.js";

/**
 * **Ce que le fournil demande à la livraison, relié** (2026-10-14).
 *
 * Un seul port : `DayDispatchProgressReader` — la production DÉCLARE, la
 * livraison implémente : « une tournée de la journée est-elle chargée ou
 * partie ? », que la réouverture d'une journée pose avant de rouvrir. Les
 * faits, eux, vont par la boîte d'envoi.
 *
 * `@Global` pour la raison des autres fils : ni `production/` ni `delivery/`
 * ne peuvent importer le module de l'autre. L'adaptateur ne demande que
 * `PrismaService`, global : aucun module à importer.
 */
@Global()
@Module({
  providers: [{ provide: DayDispatchProgressReader, useClass: PrismaDayDispatchProgressReader }],
  exports: [DayDispatchProgressReader],
})
export class ProductionDeliveryFeedModule {}
