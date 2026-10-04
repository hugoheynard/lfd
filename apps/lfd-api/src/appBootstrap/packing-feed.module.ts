import { Global, Module } from "@nestjs/common";

import { PackingStationService } from "../packing/application/station/packing-station.service.js";
import { PrismaPackingDayVersionReader } from "../packing/infrastructure/prisma-packing-day-version.reader.js";
import { PrismaPackingStationReader } from "../packing/infrastructure/prisma-packing-station.reader.js";
import { PackingModule } from "../packing/packing.module.js";
import {
  LegacyPackingReader,
  PackingDayVersionReader,
  PackingStation,
  PackingStationReader,
} from "../production/channels/packing/index.js";
import { DayLegacyPackingReader } from "../production/application/services/day-legacy-packing.reader.js";
import { ProductionModule } from "../production/production.module.js";

/**
 * **Le fil du colisage, relié** (plan `colisage/plan-domaine-colisage.md`, K1, K2).
 *
 * Quatre ports, deux sens :
 *
 * - `LegacyPackingReader` (K1) — la production publie ET implémente, la route
 *   de contrôle de l'ombre lit. Même figure que `QualityHoldsReader`.
 * - `PackingStation` et `PackingStationReader` (K2) — la production DÉCLARE,
 *   le colisage implémente : le poste d'une journée `packing`, que les routes
 *   du fournil servent toujours. Même figure que `AttestedHandoversReader`.
 * - `PackingDayVersionReader` (K2) — même sens : la version du jour au
 *   colisage, que la version du fournil additionne.
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
    { provide: LegacyPackingReader, useExisting: DayLegacyPackingReader },
    { provide: PackingStation, useExisting: PackingStationService },
    { provide: PackingStationReader, useExisting: PrismaPackingStationReader },
    { provide: PackingDayVersionReader, useClass: PrismaPackingDayVersionReader },
  ],
  exports: [LegacyPackingReader, PackingStation, PackingStationReader, PackingDayVersionReader],
})
export class PackingFeedModule {}
