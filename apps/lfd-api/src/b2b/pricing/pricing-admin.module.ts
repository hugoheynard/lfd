import { Module } from "@nestjs/common";

import { CatalogModule } from "../catalog/catalog.module.js";
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
import { PrismaPricingDecisionsReader } from "./infrastructure/prisma-pricing-decisions.reader.js";
import { PrismaPricedCompanyReader } from "./infrastructure/prisma-priced-company.reader.js";
import { PricingDecisionsReader } from "./application/ports/pricing-decisions.reader.js";
import { PricedCompanyReader } from "./domain/ports/priced-company.reader.js";
import { PrismaPricingFloorRepository } from "./infrastructure/prisma-pricing-floor.repository.js";
import { PrismaPricingJournalReader } from "./infrastructure/prisma-pricing-journal.reader.js";
import { PricingActWriter } from "./infrastructure/pricing-act.writer.js";
import { PrismaPricingRuleRepository } from "./infrastructure/prisma-pricing-rule.repository.js";
import { PrismaVolumeLadderRepository } from "./infrastructure/prisma-volume-ladder.repository.js";
import { PrismaVolumeCommitmentRepository } from "./infrastructure/prisma-volume-commitment.repository.js";
import { VolumeCommitmentsQuery } from "./application/queries/volume-commitments.query.js";
import { PriceProjectionQuery } from "./application/queries/price-projection.query.js";
import { MercurialeBenchmarkQuery } from "./application/queries/mercuriale-benchmark.query.js";
import { PriceTemplatesQuery } from "./application/queries/price-templates.query.js";
import {
  ApplyPriceTemplateHandler,
  SavePriceTemplateHandler,
} from "./application/commands/price-template.handlers.js";
import { PriceTemplateRepository } from "./domain/ports/price-template.repository.js";
import { PrismaPriceTemplateRepository } from "./infrastructure/prisma-price-template.repository.js";
import { AdminPriceTemplatesController } from "./http/admin-price-templates.controller.js";
import { AdminCompanyPricingController } from "./http/admin-company-pricing.controller.js";
import { CompanyPricingQuery } from "./application/queries/company-pricing.query.js";
import { MercurialeDraftStore } from "./application/ports/mercuriale-draft.store.js";
import { PrismaMercurialeDraftStore } from "./infrastructure/prisma-mercuriale-draft.store.js";
import { PriceTemplatesReader } from "./application/ports/price-templates.reader.js";
import { PrismaPriceTemplatesReader } from "./infrastructure/prisma-price-templates.reader.js";
import { VolumeCommitmentsReader } from "./application/ports/volume-commitments.reader.js";
import { PrismaVolumeCommitmentsReader } from "./infrastructure/prisma-volume-commitments.reader.js";
import {
  CloseCompanyMercurialeHandler,
  RenameCompanyMercurialeHandler,
  PoseCompanyMercurialeHandler,
} from "./application/commands/company-mercuriale.handlers.js";
import {
  CloseVolumeCommitmentHandler,
  SignVolumeCommitmentHandler,
} from "./application/commands/volume-commitment.handlers.js";
import { AdminVolumeCommitmentsController } from "./http/admin-volume-commitments.controller.js";
import { ReadPricingBoardHandler } from "./application/queries/read-pricing-board.handler.js";
import { ComparePricingBoardHandler } from "./application/queries/compare-pricing-board.handler.js";
import { ListArchivedPriceRulesHandler } from "./application/queries/list-archived-price-rules.handler.js";
import { ProjectPriceHandler } from "./application/queries/project-price.handler.js";
import { ReadCompanyPricingHandler } from "./application/queries/read-company-pricing.handler.js";
import { ReadMercurialeDraftHandler } from "./application/queries/read-mercuriale-draft.handler.js";
import { ReadPricingJournalHandler } from "./application/queries/read-pricing-journal.handler.js";
import { ReadSubjectJournalHandler } from "./application/queries/read-subject-journal.handler.js";
import { ReadMercurialeBenchmarkHandler } from "./application/queries/read-mercuriale-benchmark.handler.js";
import { ListPriceTemplatesHandler } from "./application/queries/list-price-templates.handler.js";
import { GetPriceTemplateHandler } from "./application/queries/get-price-template.handler.js";
import { ListVolumeCommitmentsHandler } from "./application/queries/list-volume-commitments.handler.js";
import { SaveMercurialeDraftHandler } from "./application/commands/save-mercuriale-draft.handler.js";
import { DiscardMercurialeDraftHandler } from "./application/commands/discard-mercuriale-draft.handler.js";
import { PricerModule } from "./pricer.module.js";
import { PricingModule } from "./pricing.module.js";
import { CompanyMercurialeRepository } from "./domain/ports/company-mercuriale.repository.js";
import { PricedDecisionsReader } from "./domain/ports/priced-decisions.reader.js";
import { PrismaPricedDecisionsReader } from "../orders/infrastructure/prisma-priced-decisions.reader.js";
import { PrismaCompanyMercurialeRepository } from "./infrastructure/prisma-company-mercuriale.repository.js";

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
  // `PricerModule` depuis le 2026-09-09 : les lectures de ce module passent par
  // LA porte du prix, plus par le chargeur. Elles avaient chacune leur
  // chorégraphie, et c'est ainsi que deux d'entre elles ont oublié un étage.
  imports: [CatalogModule, PricingModule, PricerModule],
  controllers: [
    AdminPricingController,
    AdminPriceFloorsController,
    AdminPricingJournalController,
    AdminVolumeCommitmentsController,
    AdminPriceTemplatesController,
    AdminCompanyPricingController,
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
    PriceTemplatesQuery,
    MercurialeBenchmarkQuery,
    CompanyPricingQuery,
    // Les lectures de ces cinq contrôleurs ont chacune un NOM et un handler
    // depuis le 2026-09-09 : les services ci-dessus ne s'injectent plus dans du
    // HTTP, ils sont délégués depuis le bus.
    ReadPricingBoardHandler,
    ComparePricingBoardHandler,
    ListArchivedPriceRulesHandler,
    ProjectPriceHandler,
    ReadCompanyPricingHandler,
    ReadMercurialeDraftHandler,
    ReadPricingJournalHandler,
    ReadSubjectJournalHandler,
    ReadMercurialeBenchmarkHandler,
    ListPriceTemplatesHandler,
    GetPriceTemplateHandler,
    ListVolumeCommitmentsHandler,
    SaveMercurialeDraftHandler,
    DiscardMercurialeDraftHandler,
    // 🔴 **Les trois dernières lectures directes de la couche application.**
    // Chacune interrogeait sa table en Prisma depuis un service applicatif —
    // ce que `CLAUDE.md` §4 interdit — et l'entrée R21 n'en comptait qu'une.
    { provide: MercurialeDraftStore, useClass: PrismaMercurialeDraftStore },
    { provide: PriceTemplatesReader, useClass: PrismaPriceTemplatesReader },
    { provide: VolumeCommitmentsReader, useClass: PrismaVolumeCommitmentsReader },
    { provide: CompanyMercurialeRepository, useClass: PrismaCompanyMercurialeRepository },
    // Le port est déclaré par `pricing`, l'adaptateur vit dans `orders` : la
    // réponse « a-t-elle facturé ? » est gelée sur la ligne de commande, et
    // `pricing` n'a pas le droit de lire ces tables.
    { provide: PricedDecisionsReader, useClass: PrismaPricedDecisionsReader },
    PoseCompanyMercurialeHandler,
    CloseCompanyMercurialeHandler,
    RenameCompanyMercurialeHandler,
    SavePriceTemplateHandler,
    ApplyPriceTemplateHandler,
    // Possède « écrire un acte » : l'état, le journal du domaine et son miroir
    // au journal général, dans une seule transaction. Il vit ICI et pas dans le
    // module de lecture — écrire est un geste d'administration.
    PricingActWriter,
    { provide: PricingRuleRepository, useClass: PrismaPricingRuleRepository },
    { provide: VolumeLadderRepository, useClass: PrismaVolumeLadderRepository },
    { provide: VolumeCommitmentRepository, useClass: PrismaVolumeCommitmentRepository },
    { provide: PriceTemplateRepository, useClass: PrismaPriceTemplateRepository },
    { provide: PricingFloorRepository, useClass: PrismaPricingFloorRepository },
    { provide: PricingBoardReader, useClass: PrismaPricingBoardReader },
    // 🔴 **Une seule lecture d'écran pour les deux tableaux.** Le général et
    // l'onglet Tarifs d'une fiche compte lisaient ces tables chacun de son
    // côté, avec deux clauses `where` — et elles avaient déjà divergé (R21).
    { provide: PricingDecisionsReader, useClass: PrismaPricingDecisionsReader },
    { provide: PricedCompanyReader, useClass: PrismaPricedCompanyReader },
    { provide: PricingJournalReader, useClass: PrismaPricingJournalReader },
  ],
  /**
   * 🔴 **Deux LECTURES sortent d'ici, et rien d'autre.** L'écran qui explique le
   * prix d'une ligne de commande a besoin des décisions d'un jour donné et du
   * journal ; il n'a aucune raison de voir les dépôts d'écriture, qui restent
   * enfermés dans ce module — c'est la raison même de son existence, écrite au
   * JSDoc de `PricerModule`.
   *
   * Le module qui les consomme est {@link OrderPricingModule}, une **jointure**
   * : ni `orders` ni `pricing` ne s'importent l'un l'autre pour ça.
   */
  exports: [PricingBoardReader, PricingJournalReader],
})
export class PricingAdminModule {}
