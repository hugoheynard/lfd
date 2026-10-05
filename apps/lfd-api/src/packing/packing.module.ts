import { Module } from "@nestjs/common";

import { OnHandedToPacking } from "./application/handlers/on-handed-to-packing.handler.js";
import { OnPackingListDrawn } from "./application/handlers/on-packing-list-drawn.handler.js";
import { OnReturnRequested } from "./application/handlers/on-return-requested.handler.js";
import { ComparePackingShadowHandler } from "./application/queries/compare-packing-shadow.handler.js";
import { PackingShadowLedger } from "./domain/ports/packing-shadow.ledger.js";
import { PackingShadowReader } from "./domain/ports/packing-shadow.reader.js";
import { PackingShadowController } from "./http/packing-shadow.controller.js";
import { ApplyPackingProposalHandler } from "./application/containers/apply-packing-proposal.handler.js";
import { GetShareableHalvesHandler } from "./application/containers/get-shareable-halves.handler.js";
import { AllocateToContainerHandler } from "./application/containers/allocate-to-container.handler.js";
import { GetPackingProposalHandler } from "./application/containers/get-packing-proposal.handler.js";
import { OpenPackingContainerHandler } from "./application/containers/open-packing-container.handler.js";
import { VoidPackingContainerHandler } from "./application/containers/void-packing-container.handler.js";
import { WithdrawFromContainerHandler } from "./application/containers/withdraw-from-container.handler.js";
import { PackingContainersController } from "./http/packing-containers.controller.js";
import { PrismaContainerManagedOrders } from "./infrastructure/prisma-container-managed-orders.js";
import { PrismaPackingShadowLedger } from "./infrastructure/prisma-packing-shadow.ledger.js";
import { PrismaPackingShadowReader } from "./infrastructure/prisma-packing-shadow.reader.js";
import { PackingReturnDesk } from "./application/returns/packing-return-desk.service.js";
import { PackingStationService } from "./application/station/packing-station.service.js";
import { PackingReturnLedger, PackingReturnReader } from "./domain/ports/packing-return.ledger.js";
import { PackingSheetRepository } from "./domain/ports/packing-sheet.repository.js";
import { PackingStockRepository } from "./domain/ports/packing-stock.repository.js";
import {
  PrismaPackingReturnLedger,
  PrismaPackingReturnReader,
} from "./infrastructure/prisma-packing-return.ledger.js";
import { PrismaPackingSheetRepository } from "./infrastructure/prisma-packing-sheet.repository.js";
import { PrismaPackingStationReader } from "./infrastructure/prisma-packing-station.reader.js";
import { PrismaPackingStockRepository } from "./infrastructure/prisma-packing-stock.repository.js";
import { GetPackingBoardHandler } from "./application/board/get-packing-board.handler.js";
import { ClosePackingOrderHandler } from "./application/station/close-packing-order.handler.js";
import { ReopenPackingOrderHandler } from "./application/station/reopen-packing-order.handler.js";
import { PackingBoardReader } from "./domain/ports/packing-board.reader.js";
import { PackingBoardController } from "./http/packing-board.controller.js";
import { PackingOrdersController } from "./http/packing-orders.controller.js";
import { PrismaPackedOrdersReader } from "./infrastructure/prisma-packed-orders.reader.js";
import { PrismaPackingBoardReader } from "./infrastructure/prisma-packing-board.reader.js";

/**
 * **Le colisage** — son propre bloc depuis le 2026-10-04 (plan
 * `documentation/colisage/plan-domaine-colisage.md`, §12–§15).
 *
 * K1 : trois abonnés durables remplissent le schéma `packing` à partir des
 * faits du fournil, et une route de contrôle compare.
 *
 * K2 : le poste d'une journée `packing` est ICI. Le fournil garde les routes —
 * l'adresse des QR imprimés — et remet le geste par deux ports qu'il déclare
 * (`PackingStation`, `PackingStationReader`) ; ce module en exporte les
 * implémentations, que `PackingFeedModule` relie. Les retours du fournil sont
 * tranchés par `PackingReturnDesk`.
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
 * `LegacyPackingReader` n'est pas déclaré ici : c'est un port que la
 * production publie et implémente, relié par `PackingFeedModule` — le
 * colisage n'importe pas le module du fournil.
 */
@Module({
  controllers: [
    PackingShadowController,
    PackingContainersController,
    PackingBoardController,
    PackingOrdersController,
  ],
  providers: [
    OnPackingListDrawn,
    OnHandedToPacking,
    OnReturnRequested,
    ComparePackingShadowHandler,
    { provide: PackingShadowLedger, useClass: PrismaPackingShadowLedger },
    { provide: PackingShadowReader, useClass: PrismaPackingShadowReader },
    // Le poste réel (K2).
    PackingStationService,
    PrismaPackingStationReader,
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
    VoidPackingContainerHandler,
    GetPackingProposalHandler,
    ApplyPackingProposalHandler,
    GetShareableHalvesHandler,
    PrismaContainerManagedOrders,
    // Le poste servi par le colisage (K3a).
    GetPackingBoardHandler,
    ClosePackingOrderHandler,
    ReopenPackingOrderHandler,
    { provide: PackingBoardReader, useClass: PrismaPackingBoardReader },
    PrismaPackedOrdersReader,
  ],
  exports: [
    PackingStationService,
    PrismaPackingStationReader,
    PrismaContainerManagedOrders,
    PrismaPackedOrdersReader,
  ],
})
export class PackingModule {}
