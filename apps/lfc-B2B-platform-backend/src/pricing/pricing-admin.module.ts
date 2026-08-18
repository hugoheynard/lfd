import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import { CatalogModule } from "../catalog/catalog.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import {
  ArchivePriceFloorHandler,
  ConfirmPriceFloorHandler,
  CreatePriceRuleHandler,
  SetPriceFloorHandler,
} from "./application/commands/pricing.handlers.js";
import {
  ArchiveVolumeLadderHandler,
  PauseVolumeLadderHandler,
  ResumeVolumeLadderHandler,
  SetVolumeLadderHandler,
} from "./application/commands/volume-ladder.handlers.js";
import {
  ArchivePriceRuleHandler,
  PausePriceRuleHandler,
  RenamePriceRuleHandler,
  ResumePriceRuleHandler,
} from "./application/commands/rule-lifecycle.handlers.js";
import { BoardComparisonService } from "./application/board-comparison.service.js";
import { BoardElasticityService } from "./application/board-elasticity.service.js";
import { PricingBoardReader } from "./application/ports/pricing-board.reader.js";
import { PricingFloorRepository } from "./domain/ports/pricing-floor.repository.js";
import { PricingJournalReader } from "./domain/ports/pricing-journal.reader.js";
import { PricingRuleRepository } from "./domain/ports/pricing-rule.repository.js";
import { VolumeLadderRepository } from "./domain/ports/volume-ladder.repository.js";
import { VolumeCommitmentRepository } from "./domain/ports/volume-commitment.repository.js";
import { AdminPriceFloorsController } from "./http/admin-price-floors.controller.js";
import { AdminPricingController } from "./http/admin-pricing.controller.js";
import { AdminPricingJournalController } from "./http/admin-pricing-journal.controller.js";
import { PrismaPricingBoardReader } from "./infrastructure/prisma-pricing-board.reader.js";
import { PrismaPricingFloorRepository } from "./infrastructure/prisma-pricing-floor.repository.js";
import { PrismaPricingJournalReader } from "./infrastructure/prisma-pricing-journal.reader.js";
import { PrismaPricingRuleRepository } from "./infrastructure/prisma-pricing-rule.repository.js";
import { PrismaVolumeLadderRepository } from "./infrastructure/prisma-volume-ladder.repository.js";
import { PrismaVolumeCommitmentRepository } from "./infrastructure/prisma-volume-commitment.repository.js";
import { VolumeCommitmentsQuery } from "./application/queries/volume-commitments.query.js";
import { PriceProjectionQuery } from "./application/queries/price-projection.query.js";
import {
  CloseVolumeCommitmentHandler,
  SignVolumeCommitmentHandler,
} from "./application/commands/volume-commitment.handlers.js";
import { AdminVolumeCommitmentsController } from "./http/admin-volume-commitments.controller.js";
import { PricingModule } from "./pricing.module.js";

/**
 * **Le paramétrage tarifaire du back-office**, séparé de `PricingModule`.
 *
 * La séparation n'est pas cosmétique : c'est elle qui empêche le chemin qui
 * facture d'écrire une règle. `OrdersModule` importe `PricingModule` et n'y
 * trouve que des ports de **lecture** ; les dépôts d'écriture ne vivent que
 * dans ce module-ci, que rien du côté commande n'importe. La garantie est
 * portée par le graphe de dépendances plutôt que par une consigne.
 *
 * Le sens des flèches impose aussi ce découpage : l'écran a besoin du catalogue
 * (`OrdersModule`), qui a besoin de la résolution (`PricingModule`). Mettre le
 * lecteur d'écran dans `PricingModule` aurait fermé le cycle.
 */
@Module({
  // `CatalogModule` pour l'historique du tarif : la lecture datée doit rendre le
  // tarif de CE jour-là, et lui seul sait le relire.
  imports: [CqrsModule, CatalogModule, OrdersModule, PricingModule],
  controllers: [
    AdminPricingController,
    AdminPriceFloorsController,
    AdminPricingJournalController,
    AdminVolumeCommitmentsController,
  ],
  providers: [
    BoardElasticityService,
    BoardComparisonService,
    CreatePriceRuleHandler,
    PausePriceRuleHandler,
    ResumePriceRuleHandler,
    RenamePriceRuleHandler,
    ArchivePriceRuleHandler,
    ConfirmPriceFloorHandler,
    SetPriceFloorHandler,
    ArchivePriceFloorHandler,
    SetVolumeLadderHandler,
    PauseVolumeLadderHandler,
    ResumeVolumeLadderHandler,
    ArchiveVolumeLadderHandler,
    SignVolumeCommitmentHandler,
    CloseVolumeCommitmentHandler,
    VolumeCommitmentsQuery,
    PriceProjectionQuery,
    { provide: PricingRuleRepository, useClass: PrismaPricingRuleRepository },
    { provide: VolumeLadderRepository, useClass: PrismaVolumeLadderRepository },
    { provide: VolumeCommitmentRepository, useClass: PrismaVolumeCommitmentRepository },
    { provide: PricingFloorRepository, useClass: PrismaPricingFloorRepository },
    { provide: PricingBoardReader, useClass: PrismaPricingBoardReader },
    { provide: PricingJournalReader, useClass: PrismaPricingJournalReader },
  ],
})
export class PricingAdminModule {}
