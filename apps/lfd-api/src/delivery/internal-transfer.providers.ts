import type { Provider, Type } from "@nestjs/common";

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
 * placement dans les tournées, le manifeste.
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
  { provide: InternalTransferRepository, useClass: PrismaInternalTransferRepository },
  { provide: InternalTransfersReader, useClass: PrismaInternalTransfersReader },
  { provide: TransferredOrdersReader, useClass: PrismaTransferredOrdersReader },
];
