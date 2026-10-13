import type { Provider, Type } from "@nestjs/common";

import { DropTransferAtSiteHandler } from "./application/commands/drop-transfer-at-site.handler.js";
import { AttachOnOrderPlaced } from "./application/handlers/attach-on-order-placed.handler.js";
import { DetachOnOrderCancelled } from "./application/handlers/detach-on-order-cancelled.handler.js";
import { TransferMembership } from "./application/transfer-membership.js";
import { TransferReception } from "./application/transfer-reception.js";
import { TransferArrivalStatus } from "./application/transfer-arrival-status.js";
import { DeclareTransferBinsHandler } from "./application/commands/declare-transfer-bins.handler.js";
import { GetDeliveryTransferBinsHandler } from "./application/queries/get-delivery-transfer-bins.handler.js";
import { CarriedOrderTransfers } from "./domain/ports/carried-order-transfers.reader.js";
import { TransferBinCounts } from "./domain/ports/transfer-bin-counts.reader.js";
import { PrismaCarriedOrderTransfers } from "./infrastructure/prisma-carried-order-transfers.reader.js";
import { PrismaTransferBinCounts } from "./infrastructure/prisma-transfer-bin-counts.reader.js";
import { GetInternalTransferManifestHandler } from "./application/queries/get-internal-transfer-manifest.handler.js";
import { TransferAttachment } from "./application/transfer-attachment.js";
import { TransferPlacement } from "./application/transfer-placement.js";
import { TransferPlaceFinder, TransferPlacer } from "./application/transfer-placer.js";
import { TransferRouting } from "./application/transfer-routing.js";
import { InternalTransferRepository } from "./domain/ports/internal-transfer.repository.js";
import {
  InternalTransfersReader,
  TransferredOrdersReader,
} from "./domain/ports/internal-transfers.reader.js";
import { InternalTransfersController } from "./http/internal-transfers.controller.js";
import {
  PrismaInternalTransferRepository,
  PrismaInternalTransfersReader,
  PrismaTransferredOrdersReader,
} from "./infrastructure/prisma-internal-transfer.repository.js";

/**
 * **Le transfert interne** (plan du transfert interne, lot T1), rangé à part
 * pour que `delivery.module.ts` reste lisible : l'agrégat et ses deux ports
 * de lecture (ISP), le rangement des commandes à l'arrêt du plan, le
 * placement dans les tournées, le manifeste ; la réception et la place d'une
 * commande passée ou annulée (lot T2) ; les bacs du transfert et l'attente
 * d'un transfert au comptoir (lot T3).
 *
 * Les ports que le commerce implémente (`TransferOrdersReader`,
 * `TransferSitesReader`, `TransferOrderContentsReader`) sont reliés dans
 * `appBootstrap/delivery-feed.module.ts`.
 */
export const INTERNAL_TRANSFER_CONTROLLERS: readonly Type[] = [InternalTransfersController];

export const INTERNAL_TRANSFER_PROVIDERS: readonly Provider[] = [
  TransferAttachment,
  TransferRouting,
  { provide: TransferPlaceFinder, useExisting: TransferRouting },
  TransferPlacement,
  { provide: TransferPlacer, useExisting: TransferPlacement },
  GetInternalTransferManifestHandler,
  // Lot T2 : la réception, la place d'une commande passée ou annulée.
  TransferReception,
  TransferMembership,
  AttachOnOrderPlaced,
  DetachOnOrderCancelled,
  DropTransferAtSiteHandler,
  { provide: InternalTransferRepository, useClass: PrismaInternalTransferRepository },
  { provide: InternalTransfersReader, useClass: PrismaInternalTransfersReader },
  { provide: TransferredOrdersReader, useClass: PrismaTransferredOrdersReader },
  // Lot T3 : les bacs du transfert, et « arrivée au site ? » avec F4.
  DeclareTransferBinsHandler,
  GetDeliveryTransferBinsHandler,
  TransferArrivalStatus,
  { provide: CarriedOrderTransfers, useClass: PrismaCarriedOrderTransfers },
  { provide: TransferBinCounts, useClass: PrismaTransferBinCounts },
];
