import { Module } from "@nestjs/common";

import { OnHandedToPacking } from "./application/handlers/on-handed-to-packing.handler.js";
import { OnPackingListDrawn } from "./application/handlers/on-packing-list-drawn.handler.js";
import { OnReturnRequested } from "./application/handlers/on-return-requested.handler.js";
import { ComparePackingShadowHandler } from "./application/queries/compare-packing-shadow.handler.js";
import { PackingShadowLedger } from "./domain/ports/packing-shadow.ledger.js";
import { PackingShadowReader } from "./domain/ports/packing-shadow.reader.js";
import { PackingShadowController } from "./http/packing-shadow.controller.js";
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
 * `LegacyPackingReader` n'est pas déclaré ici : c'est un port que la
 * production publie et implémente, relié par `PackingFeedModule` — le
 * colisage n'importe pas le module du fournil.
 */
@Module({
  controllers: [PackingShadowController],
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
  ],
  exports: [PackingStationService, PrismaPackingStationReader],
})
export class PackingModule {}
