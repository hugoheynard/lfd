import { Global, Module } from "@nestjs/common";

import { LegacyPackingReader } from "../production/channels/packing/index.js";
import { DayLegacyPackingReader } from "../production/application/services/day-legacy-packing.reader.js";
import { ProductionModule } from "../production/production.module.js";

/**
 * **Le fil du colisage, relié** (plan `colisage/plan-domaine-colisage.md`, K1).
 *
 * Un seul port : `LegacyPackingReader`, que la production publie ET
 * implémente, et que la route de contrôle de l'ombre lit. Même figure que
 * `QualityHoldsReader` dans `HandoverFeedModule`.
 *
 * Les faits, eux, ne passent pas par ici : ils vont par la boîte d'envoi, et
 * les abonnés du colisage les trouvent par `@DurableHandler`.
 *
 * `@Global` pour la raison des autres fils : le consommateur est `packing/`,
 * qui ne peut pas importer le module du fournil sans franchir la frontière.
 */
@Global()
@Module({
  imports: [ProductionModule],
  providers: [{ provide: LegacyPackingReader, useExisting: DayLegacyPackingReader }],
  exports: [LegacyPackingReader],
})
export class PackingFeedModule {}
