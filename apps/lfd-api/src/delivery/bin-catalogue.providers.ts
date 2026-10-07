import type { Provider, Type } from "@nestjs/common";

import { AddBinTypeHandler } from "./application/commands/add-bin-type.handler.js";
import { ArchiveBinTypeHandler } from "./application/commands/archive-bin-type.handler.js";
import { CorrectBinTypeHandler } from "./application/commands/correct-bin-type.handler.js";
import { ReactivateBinTypeHandler } from "./application/commands/reactivate-bin-type.handler.js";
import { SetBinCapacityHandler } from "./application/commands/set-bin-capacity.handler.js";
import { GetBinCapacitiesHandler } from "./application/queries/get-bin-capacities.handler.js";
import { ListBinTypesHandler } from "./application/queries/list-bin-types.handler.js";
import { BinCapacityRepository } from "./domain/ports/bin-capacity.repository.js";
import { BinCatalogReader } from "./domain/ports/bin-catalog.reader.js";
import { BinTypeLookup } from "./domain/ports/bin-type-lookup.js";
import { BinTypeRepository } from "./domain/ports/bin-type.repository.js";
import { BinCapacitiesController } from "./http/bin-capacities.controller.js";
import { BinTypesController } from "./http/bin-types.controller.js";
import { PrismaBinCapacityRepository } from "./infrastructure/prisma-bin-capacity.repository.js";
import { PrismaBinCatalogReader } from "./infrastructure/prisma-bin-catalog.reader.js";
import { PrismaBinTypeRepository } from "./infrastructure/prisma-bin-type.repository.js";

/**
 * **Le catalogue des bacs et leurs contenances** (lot 4 bis, tranche A) :
 * rangé à part pour que `delivery.module.ts` reste lisible.
 */
export const BIN_CATALOGUE_CONTROLLERS: readonly Type[] = [
  BinTypesController,
  BinCapacitiesController,
];

export const BIN_CATALOGUE_PROVIDERS: readonly Provider[] = [
  AddBinTypeHandler,
  CorrectBinTypeHandler,
  ArchiveBinTypeHandler,
  ReactivateBinTypeHandler,
  SetBinCapacityHandler,
  ListBinTypesHandler,
  GetBinCapacitiesHandler,
  { provide: BinTypeRepository, useClass: PrismaBinTypeRepository },
  { provide: BinTypeLookup, useExisting: BinTypeRepository },
  { provide: BinCapacityRepository, useClass: PrismaBinCapacityRepository },
  { provide: BinCatalogReader, useClass: PrismaBinCatalogReader },
];
