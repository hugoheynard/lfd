import { Global, Module } from "@nestjs/common";

import { RoundPlacementsReader } from "../delivery/channels/handover/index.js";
import { PrismaRoundPlacementsReader } from "../delivery/infrastructure/prisma-round-placements.reader.js";

/**
 * **La place des commandes dans les tournées, reliée** (2026-10-06) — la
 * livraison déclare et implémente, le retrait lit pour sa Feuille de route.
 *
 * Module à part plutôt que `DeliveryHandoverFeedModule` : celui-ci importe
 * `HandoverModule`, qui est justement le consommateur. `@Global` pour la
 * raison des autres fils : le retrait ne peut pas importer `DeliveryModule`.
 */
@Global()
@Module({
  providers: [{ provide: RoundPlacementsReader, useClass: PrismaRoundPlacementsReader }],
  exports: [RoundPlacementsReader],
})
export class DeliveryRoundPlacementsModule {}
