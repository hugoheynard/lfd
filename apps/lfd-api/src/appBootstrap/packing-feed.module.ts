import { Global, Module } from "@nestjs/common";

import { PrismaPackingDayVersionReader } from "../packing/infrastructure/prisma-packing-day-version.reader.js";
import { PrismaDayPackingProgressReader } from "../packing/infrastructure/prisma-day-packing-progress.reader.js";
import { PrismaPackedOrdersReader } from "../packing/infrastructure/prisma-packed-orders.reader.js";
import {
  PackedResuppliesReader,
  PackingWithdrawalDesk,
  ShortfallDesk,
} from "../packing/channels/commerce/index.js";
import { PackingSheetWithdrawalDesk } from "../packing/application/withdrawal/packing-sheet-withdrawal.desk.js";
import { PackingShortfallDesk } from "../packing/application/station/packing-shortfall-desk.js";
import { PrismaPackedResuppliesReader } from "../packing/infrastructure/prisma-packed-resupplies.reader.js";
import { PackingModule } from "../packing/packing.module.js";
import {
  DayPackingProgressReader,
  InscribedOrderHeaderReader,
  PackedOrdersReader,
  PackingDayVersionReader,
  PlannedDestinationsReader,
  QualityHeldOrdersReader,
} from "../production/channels/packing/index.js";
import { ChannelQualityHeldOrdersReader } from "../production/application/services/channel-quality-held-orders.reader.js";
import { DayPlannedDestinationsReader } from "../production/application/services/day-planned-destinations.reader.js";
import { DayInscribedOrderHeaderReader } from "../production/application/services/day-inscribed-order-header.reader.js";
import { ProductionModule } from "../production/production.module.js";

/**
 * **Le fil du colisage, relié** (plan `colisage/colisage.md`, K1, K2,
 * K3a ; l'ancien poste et l'ombre retirés en K3c).
 *
 * Les ports, deux sens :
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
 * - `PackedResuppliesReader` (réassort R3b, 2026-10-21) — le colisage
 *   DÉCLARE ET IMPLÉMENTE, le commerce lit : l'emballé d'un réassort, pour
 *   pré-remplir sa réception (`packing/channels/commerce/`).
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
    // La réouverture d'une journée (2026-10-14) : « le colisage a-t-il
    // commencé ? » — la production déclare, le colisage implémente.
    { provide: DayPackingProgressReader, useClass: PrismaDayPackingProgressReader },
    { provide: PackedResuppliesReader, useExisting: PrismaPackedResuppliesReader },
    // Le départ incomplet (E6b, 2026-10-25) — le colisage déclare ET
    // implémente, le commerce l'appelle dans la transaction de sa décision.
    { provide: ShortfallDesk, useExisting: PackingShortfallDesk },
    // Le retrait d'une commande inscrite (plan A1, 2026-10-25) — le colisage
    // déclare ET implémente, le commerce l'appelle après le guichet du
    // fournil ; la pierre tombale lit l'en-tête que le fournil publie.
    { provide: PackingWithdrawalDesk, useExisting: PackingSheetWithdrawalDesk },
    { provide: InscribedOrderHeaderReader, useExisting: DayInscribedOrderHeaderReader },
  ],
  exports: [
    PackingDayVersionReader,
    QualityHeldOrdersReader,
    PlannedDestinationsReader,
    PackedOrdersReader,
    DayPackingProgressReader,
    PackedResuppliesReader,
    ShortfallDesk,
    PackingWithdrawalDesk,
    InscribedOrderHeaderReader,
  ],
})
export class PackingFeedModule {}
