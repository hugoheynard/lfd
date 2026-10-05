import { Module } from "@nestjs/common";

import { OnHandedToPacking } from "./application/handlers/on-handed-to-packing.handler.js";
import { OnPackingListDrawn } from "./application/handlers/on-packing-list-drawn.handler.js";
import { OnReturnRequested } from "./application/handlers/on-return-requested.handler.js";
import { PackingShadowLedger } from "./domain/ports/packing-shadow.ledger.js";
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
 */
@Module({
  controllers: [PackingContainersController, PackingBoardController, PackingOrdersController],
  providers: [
    OnPackingListDrawn,
    OnHandedToPacking,
    OnReturnRequested,
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
  exports: [PrismaContainerManagedOrders, PrismaPackedOrdersReader],
})
export class PackingModule {}
