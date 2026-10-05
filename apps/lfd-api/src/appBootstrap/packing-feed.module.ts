import { Global, Module } from "@nestjs/common";

import { PrismaPackingDayVersionReader } from "../packing/infrastructure/prisma-packing-day-version.reader.js";
import { PrismaPackedOrdersReader } from "../packing/infrastructure/prisma-packed-orders.reader.js";
import { PackingModule } from "../packing/packing.module.js";
import {
  PackedOrdersReader,
  PackingDayVersionReader,
  PlannedDestinationsReader,
  QualityHeldOrdersReader,
} from "../production/channels/packing/index.js";
import { ChannelQualityHeldOrdersReader } from "../production/application/services/channel-quality-held-orders.reader.js";
import { DayPlannedDestinationsReader } from "../production/application/services/day-planned-destinations.reader.js";
import { ProductionModule } from "../production/production.module.js";

/**
 * **Le fil du colisage, relié** (plan `colisage/colisage.md`, K1, K2,
 * K3a ; l'ancien poste et l'ombre retirés en K3c).
 *
 * Quatre ports, deux sens :
 *
 * - `PackingDayVersionReader` (K2) — la production DÉCLARE, le colisage
 *   implémente : la version du jour au colisage, que la version du fournil
 *   additionne. Même figure que `AttestedHandoversReader`.
 *
 * - `QualityHeldOrdersReader` et `PlannedDestinationsReader` (K3a) — la
 *   production publie ET implémente, le poste servi par le colisage lit.
 * - `PackedOrdersReader` (K3a) — la production DÉCLARE, le colisage
 *   implémente : « cette commande est-elle colisée ? », pour l'état du jour et
 *   le contrôle qualité.
 *
 * Les faits, eux, ne passent pas par ici : ils vont par la boîte d'envoi, et
 * les abonnés les trouvent par `@DurableHandler`.
 *
 * `@Global` pour la raison des autres fils : ni `packing/` ni `production/` ne
 * peuvent importer le module de l'autre sans franchir la frontière.
 */
@Global()
@Module({
  imports: [ProductionModule, PackingModule],
  providers: [
    { provide: PackingDayVersionReader, useClass: PrismaPackingDayVersionReader },
    { provide: QualityHeldOrdersReader, useExisting: ChannelQualityHeldOrdersReader },
    { provide: PlannedDestinationsReader, useExisting: DayPlannedDestinationsReader },
    { provide: PackedOrdersReader, useExisting: PrismaPackedOrdersReader },
  ],
  exports: [
    PackingDayVersionReader,
    QualityHeldOrdersReader,
    PlannedDestinationsReader,
    PackedOrdersReader,
  ],
})
export class PackingFeedModule {}
