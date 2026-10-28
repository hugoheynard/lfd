import { Module } from "@nestjs/common";

import { OnHandedToPacking } from "./application/handlers/on-handed-to-packing.handler.js";
import { OnPackingListDrawn } from "./application/handlers/on-packing-list-drawn.handler.js";
import { OnReturnRequested } from "./application/handlers/on-return-requested.handler.js";
import { OnProductionDayReopened } from "./application/handlers/on-production-day-reopened.handler.js";
import { PackingListWithdrawal } from "./domain/ports/packing-list-withdrawal.js";
import { PrismaPackingListWithdrawal } from "./infrastructure/prisma-packing-list-withdrawal.js";
import { PackingShadowLedger } from "./domain/ports/packing-shadow.ledger.js";
import { ApplyPackingProposalHandler } from "./application/containers/apply-packing-proposal.handler.js";
import { GetShareableHalvesHandler } from "./application/containers/get-shareable-halves.handler.js";
import { GetBagLabelsHandler } from "./application/containers/get-bag-labels.handler.js";
import { GetBagLabelsPdfHandler } from "./application/containers/get-bag-labels-pdf.handler.js";
import { GetBagLabelSpecimenHandler } from "./application/queries/get-bag-label-specimen.handler.js";
import { BrandModule } from "../platform/brand/brand.module.js";
import { AdminBagLabelSpecimenController } from "./http/admin-bag-label-specimen.controller.js";
import { AllocateToContainerHandler } from "./application/containers/allocate-to-container.handler.js";
import { GetPackingProposalHandler } from "./application/containers/get-packing-proposal.handler.js";
import { OpenPackingContainerHandler } from "./application/containers/open-packing-container.handler.js";
import { VoidPackingContainerHandler } from "./application/containers/void-packing-container.handler.js";
import { MoveBetweenContainersHandler } from "./application/containers/move-between-containers.handler.js";
import { WithdrawFromContainerHandler } from "./application/containers/withdraw-from-container.handler.js";
import { PackingContainersController } from "./http/packing-containers.controller.js";
import { PrismaContainerManagedOrders } from "./infrastructure/prisma-container-managed-orders.js";
import { PrismaPackingShadowLedger } from "./infrastructure/prisma-packing-shadow.ledger.js";
import { PackingReturnDesk } from "./application/returns/packing-return-desk.service.js";
import { PackingReturnLedger, PackingReturnReader } from "./domain/ports/packing-return.ledger.js";
import { PackingSheetRepository } from "./domain/ports/packing-sheet.repository.js";
import { PackingStockRepository } from "./domain/ports/packing-stock.repository.js";
import {
  PrismaPackingReturnLedger,
  PrismaPackingReturnReader,
} from "./infrastructure/prisma-packing-return.ledger.js";
import { PrismaPackingSheetRepository } from "./infrastructure/prisma-packing-sheet.repository.js";
import { PrismaPackingStockRepository } from "./infrastructure/prisma-packing-stock.repository.js";
import { BoardOvenWaitingOrdersReader } from "./application/board/board-oven-waiting-orders.reader.js";
import { GetPackingBoardHandler } from "./application/board/get-packing-board.handler.js";
import { ClosePackingOrderHandler } from "./application/station/close-packing-order.handler.js";
import { ReportPackingShortfallHandler } from "./application/station/report-packing-shortfall.handler.js";
import { ReopenPackingOrderHandler } from "./application/station/reopen-packing-order.handler.js";
import { PackingBoardReader } from "./domain/ports/packing-board.reader.js";
import { PackingBoardController } from "./http/packing-board.controller.js";
import { PackingOrdersController } from "./http/packing-orders.controller.js";
import { PrismaPackedOrdersReader } from "./infrastructure/prisma-packed-orders.reader.js";
import { PrismaOrderPackingStateReader } from "./infrastructure/prisma-order-packing-state.reader.js";
import { PrismaPackingBoardReader } from "./infrastructure/prisma-packing-board.reader.js";
import { OnResupplyListDrawn } from "./application/handlers/on-resupply-list-drawn.handler.js";
import { OnResupplyLaunched } from "./application/handlers/on-resupply-launched.handler.js";
import { PackingDayStocksReader } from "./domain/ports/packing-day-stocks.reader.js";
import { PrismaPackingDayStocksReader } from "./infrastructure/prisma-packing-day-stocks.reader.js";
import { ClosePackingResupplyHandler } from "./application/resupplies/close-packing-resupply.handler.js";
import { EnterPackedResupplyLineHandler } from "./application/resupplies/enter-packed-resupply-line.handler.js";
import { ListPackingResuppliesHandler } from "./application/resupplies/list-packing-resupplies.handler.js";
import { PackingResupplyBoardReader } from "./domain/ports/packing-resupply-board.reader.js";
import { PackingResupplyListing } from "./domain/ports/packing-resupply-listing.js";
import { PackingResupplyRepository } from "./domain/ports/packing-resupply.repository.js";
import { PrismaPackedResuppliesReader } from "./infrastructure/prisma-packed-resupplies.reader.js";
import { PackingShortfallDesk } from "./application/station/packing-shortfall-desk.js";
import { PackingReserveShopRelease } from "./application/shop-release/packing-reserve-shop-release.js";
import { PackingContainerVoiding } from "./application/containers/packing-container-voiding.js";
import { PackingSheetWithdrawalDesk } from "./application/withdrawal/packing-sheet-withdrawal.desk.js";
import { PackingSheetRevisionDesk } from "./application/revision/packing-sheet-revision.desk.js";
import { PackingSheetTombstones } from "./domain/ports/packing-sheet-tombstones.js";
import { PrismaPackingSheetTombstones } from "./infrastructure/prisma-packing-sheet-tombstones.js";
import {
  PrismaPackingResupplyBoardReader,
  PrismaPackingResupplyRepository,
} from "./infrastructure/prisma-packing-resupply.repository.js";
import { PrismaPackingResupplyListing } from "./infrastructure/prisma-packing-resupply-listing.js";
import { PackingResuppliesController } from "./http/packing-resupplies.controller.js";
import { GetPackingSettingsHandler } from "./application/settings/get-packing-settings.handler.js";
import { SetPackingSettingsHandler } from "./application/settings/set-packing-settings.handler.js";
import { PackingSettingsReader } from "./domain/ports/packing-settings.reader.js";
import { PackingSettingsRepository } from "./domain/ports/packing-settings.repository.js";
import { PackingSettingsController } from "./http/packing-settings.controller.js";
import { PrismaPackingSettingsReader } from "./infrastructure/prisma-packing-settings.reader.js";
import { PrismaPackingSettingsRepository } from "./infrastructure/prisma-packing-settings.repository.js";

/**
 * **Le colisage** — son propre bloc depuis le 2026-10-04 (plan
 * `documentation/colisage/colisage.md`, §12–§15).
 *
 * K1 : trois abonnés durables remplissent le schéma `packing` à partir des
 * faits du fournil (`PackingShadowLedger` garde ce nom : les noms d'abonnés
 * sont les clés des reçus déjà posés).
 *
 * K2 : les retours du fournil sont tranchés par `PackingReturnDesk`.
 *
 * K2b : la colonne Contenants — ses routes, ses gestes, et le canal
 * `packing/channels/delivery/` (`BinDesk` implémenté par la livraison,
 * `ContainerManagedOrders` par ce module), reliés par
 * `PackingDeliveryFeedModule`.
 *
 * K3a : le poste est SERVI ici — `GET admin/packing/:date/board`, fermer et
 * rouvrir une commande. Il lit ses tables, et demande au fournil, par deux
 * ports que celui-ci publie (`QualityHeldOrdersReader`,
 * `PlannedDestinationsReader`), la retenue au contrôle et la destination. Il
 * implémente `PackedOrdersReader`, que le fournil lit pour l'état du jour et
 * le contrôle qualité. Tous reliés par `PackingFeedModule`.
 *
 * K3c : l'ancien chemin est retiré — le poste du fournil, ses ports
 * (`PackingStation`, `PackingStationReader`), l'ombre et sa route de
 * comparaison (`LegacyPackingReader`). Plan, §17.3.
 *
 * Réassort R3b (2026-10-21) : la fiche de réassort, à part des commandes —
 * son abonné (`production.resupply_list_drawn`), ses gestes (saisir l'emballé,
 * clore), sa liste, et `PackedResuppliesReader`, que le commerce lit par
 * `packing/channels/commerce/` (relié par `PackingFeedModule`).
 *
 * Réglages › Colisage (2026-10-25) : ses réglages, dont le partage d'une
 * moitié de bac, fermé par défaut.
 */
@Module({
  // Le logo des étiquettes de sac (2026-10-25).
  imports: [BrandModule],
  controllers: [
    PackingContainersController,
    PackingBoardController,
    PackingOrdersController,
    PackingResuppliesController,
    PackingSettingsController,
    AdminBagLabelSpecimenController,
  ],
  providers: [
    OnPackingListDrawn,
    OnHandedToPacking,
    OnReturnRequested,
    // La réouverture d'une journée (2026-10-14) : la liste du jour se retire.
    OnProductionDayReopened,
    { provide: PackingListWithdrawal, useClass: PrismaPackingListWithdrawal },
    { provide: PackingShadowLedger, useClass: PrismaPackingShadowLedger },
    // Les retours du fournil (K2).
    PackingReturnDesk,
    { provide: PackingSheetRepository, useClass: PrismaPackingSheetRepository },
    { provide: PackingStockRepository, useClass: PrismaPackingStockRepository },
    { provide: PackingReturnLedger, useClass: PrismaPackingReturnLedger },
    { provide: PackingReturnReader, useClass: PrismaPackingReturnReader },
    // La colonne Contenants (K2b) : ses gestes passent par `BinDesk` pour un
    // bac ; `ContainerManagedOrders` est relu par la livraison.
    OpenPackingContainerHandler,
    AllocateToContainerHandler,
    WithdrawFromContainerHandler,
    MoveBetweenContainersHandler,
    VoidPackingContainerHandler,
    // Le geste d'annulation, partagé avec le retrait d'une feuille (plan A1).
    PackingContainerVoiding,
    GetPackingProposalHandler,
    ApplyPackingProposalHandler,
    GetShareableHalvesHandler,
    GetBagLabelsHandler,
    GetBagLabelsPdfHandler,
    GetBagLabelSpecimenHandler,
    PrismaContainerManagedOrders,
    // Le poste servi par le colisage (K3a).
    GetPackingBoardHandler,
    ClosePackingOrderHandler,
    ReportPackingShortfallHandler,
    // Le départ incomplet décidé par le commerce (E6b), relié par `PackingFeedModule`.
    PackingShortfallDesk,
    // Le retrait d'une feuille par l'annulation (plan A1), relié par `PackingFeedModule`.
    PackingSheetWithdrawalDesk,
    // La révision d'une feuille après l'arrêt (plan A2), reliée par `PackingFeedModule`.
    PackingSheetRevisionDesk,
    // La sortie de réserve en boutique (plan A1, lot A1.4), reliée par `PackingFeedModule`.
    PackingReserveShopRelease,
    { provide: PackingSheetTombstones, useClass: PrismaPackingSheetTombstones },
    ReopenPackingOrderHandler,
    { provide: PackingBoardReader, useClass: PrismaPackingBoardReader },
    PrismaPackedOrdersReader,
    BoardOvenWaitingOrdersReader,
    // La fiche de réassort (R3b).
    OnResupplyListDrawn,
    OnResupplyLaunched,
    EnterPackedResupplyLineHandler,
    ClosePackingResupplyHandler,
    ListPackingResuppliesHandler,
    { provide: PackingResupplyRepository, useClass: PrismaPackingResupplyRepository },
    { provide: PackingResupplyListing, useClass: PrismaPackingResupplyListing },
    { provide: PackingResupplyBoardReader, useClass: PrismaPackingResupplyBoardReader },
    { provide: PackingDayStocksReader, useClass: PrismaPackingDayStocksReader },
    PrismaPackedResuppliesReader,
    PrismaOrderPackingStateReader,
    // Réglages › Colisage (2026-10-25).
    GetPackingSettingsHandler,
    SetPackingSettingsHandler,
    { provide: PackingSettingsReader, useClass: PrismaPackingSettingsReader },
    { provide: PackingSettingsRepository, useClass: PrismaPackingSettingsRepository },
  ],
  exports: [
    PrismaContainerManagedOrders,
    PrismaPackedOrdersReader,
    BoardOvenWaitingOrdersReader,
    PrismaPackedResuppliesReader,
    PrismaOrderPackingStateReader,
    PackingShortfallDesk,
    PackingSheetWithdrawalDesk,
    PackingSheetRevisionDesk,
    PackingReserveShopRelease,
  ],
})
export class PackingModule {}
