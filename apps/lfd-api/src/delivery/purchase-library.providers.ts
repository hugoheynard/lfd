import type { Provider, Type } from "@nestjs/common";

import { ArchivePurchaseBinCandidateHandler } from "./application/commands/archive-purchase-bin-candidate.handler.js";
import { ArchivePurchaseVehicleCandidateHandler } from "./application/commands/archive-purchase-vehicle-candidate.handler.js";
import { CorrectPurchaseBinCandidateHandler } from "./application/commands/correct-purchase-bin-candidate.handler.js";
import { CorrectPurchaseVehicleCandidateHandler } from "./application/commands/correct-purchase-vehicle-candidate.handler.js";
import { DeclarePurchaseBinCandidateHandler } from "./application/commands/declare-purchase-bin-candidate.handler.js";
import { DeclarePurchaseVehicleCandidateHandler } from "./application/commands/declare-purchase-vehicle-candidate.handler.js";
import { ReactivatePurchaseBinCandidateHandler } from "./application/commands/reactivate-purchase-bin-candidate.handler.js";
import { ReactivatePurchaseVehicleCandidateHandler } from "./application/commands/reactivate-purchase-vehicle-candidate.handler.js";
import { CrossPurchaseTableHandler } from "./application/queries/cross-purchase-table.handler.js";
import { ListPurchaseBinCandidatesHandler } from "./application/queries/list-purchase-bin-candidates.handler.js";
import { ListPurchaseVehicleCandidatesHandler } from "./application/queries/list-purchase-vehicle-candidates.handler.js";
import { PurchaseBinCandidateRepository } from "./domain/ports/purchase-bin-candidate.repository.js";
import { PurchaseBinCandidatesReader } from "./domain/ports/purchase-bin-candidates.reader.js";
import { PurchaseVehicleCandidateRepository } from "./domain/ports/purchase-vehicle-candidate.repository.js";
import { PurchaseVehicleCandidatesReader } from "./domain/ports/purchase-vehicle-candidates.reader.js";
import { PurchaseBinCandidatesController } from "./http/purchase-bin-candidates.controller.js";
import { PurchaseVehicleCandidatesController } from "./http/purchase-vehicle-candidates.controller.js";
import { PrismaPurchaseBinCandidateRepository } from "./infrastructure/prisma-purchase-bin-candidate.repository.js";
import { PrismaPurchaseBinCandidatesReader } from "./infrastructure/prisma-purchase-bin-candidates.reader.js";
import { PrismaPurchaseVehicleCandidateRepository } from "./infrastructure/prisma-purchase-vehicle-candidate.repository.js";
import { PrismaPurchaseVehicleCandidatesReader } from "./infrastructure/prisma-purchase-vehicle-candidates.reader.js";

/**
 * **La bibliothèque d'achat** (`plan-bibliotheque-d-achat.md`, lot B1), rangée
 * à part pour que `delivery.module.ts` reste lisible : ses contrôleurs, ses
 * handlers, ses ports et leurs adaptateurs. Rien ici n'ÉCRIT la flotte ni le
 * catalogue des bacs (B-D1) ; le tableau croisé (B2) les LIT, par leurs ports
 * de lecture liés dans `delivery.module.ts`.
 */
export const PURCHASE_LIBRARY_CONTROLLERS: readonly Type[] = [
  PurchaseVehicleCandidatesController,
  PurchaseBinCandidatesController,
];

export const PURCHASE_LIBRARY_PROVIDERS: readonly Provider[] = [
  DeclarePurchaseVehicleCandidateHandler,
  CorrectPurchaseVehicleCandidateHandler,
  ArchivePurchaseVehicleCandidateHandler,
  ReactivatePurchaseVehicleCandidateHandler,
  ListPurchaseVehicleCandidatesHandler,
  DeclarePurchaseBinCandidateHandler,
  CorrectPurchaseBinCandidateHandler,
  ArchivePurchaseBinCandidateHandler,
  ReactivatePurchaseBinCandidateHandler,
  ListPurchaseBinCandidatesHandler,
  CrossPurchaseTableHandler,
  {
    provide: PurchaseVehicleCandidateRepository,
    useClass: PrismaPurchaseVehicleCandidateRepository,
  },
  { provide: PurchaseVehicleCandidatesReader, useClass: PrismaPurchaseVehicleCandidatesReader },
  { provide: PurchaseBinCandidateRepository, useClass: PrismaPurchaseBinCandidateRepository },
  { provide: PurchaseBinCandidatesReader, useClass: PrismaPurchaseBinCandidatesReader },
];
