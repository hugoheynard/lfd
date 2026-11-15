import { Global, Module } from "@nestjs/common";

import { PrismaDayDispatchProgressReader } from "../delivery/infrastructure/prisma-day-dispatch-progress.reader.js";
import {
  DayDispatchProgressReader,
  FrozenResuppliesReader,
} from "../production/channels/delivery/index.js";
import { PrismaFrozenResuppliesReader } from "../production/day/production-day.module.js";
import { ProductionModule } from "../production/production.module.js";

/**
 * **Ce que le fournil demande à la livraison, relié** (2026-10-14).
 *
 * - `DayDispatchProgressReader` — la production DÉCLARE, la livraison
 *   implémente : « une tournée de la journée est-elle chargée ou partie ? »,
 *   que la réouverture d'une journée pose avant de rouvrir ;
 * - `FrozenResuppliesReader` (réassort, R3c, 2026-10-21) — la production
 *   déclare ET implémente : les réassorts figés à l'arrêt, que la livraison
 *   attache au transfert de leur point.
 *
 * Les faits, eux, vont par la boîte d'envoi.
 *
 * `@Global` pour la raison des autres fils : ni `production/` ni `delivery/`
 * ne peuvent importer le module de l'autre. Les réassorts figés sont lus par
 * le noyau du fournil, qui exporte son adaptateur : la racine le relie par le
 * module.
 */
@Global()
@Module({
  imports: [ProductionModule],
  providers: [
    { provide: DayDispatchProgressReader, useClass: PrismaDayDispatchProgressReader },
    { provide: FrozenResuppliesReader, useExisting: PrismaFrozenResuppliesReader },
  ],
  exports: [DayDispatchProgressReader, FrozenResuppliesReader],
})
export class ProductionDeliveryFeedModule {}
