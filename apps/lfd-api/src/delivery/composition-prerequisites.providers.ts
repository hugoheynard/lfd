import type { Provider } from "@nestjs/common";

import {
  ActiveBinTypesReader,
  MeasuredVehiclesReader,
} from "./domain/ports/composition-prerequisites.readers.js";
import {
  PrismaActiveBinTypesReader,
  PrismaMeasuredVehiclesReader,
} from "./infrastructure/prisma-composition-prerequisites.readers.js";

/** Le socle de la composition (CA-D3) : ce que « Proposer », le retrait et l'archivage lisent. */
export const COMPOSITION_PREREQUISITES_PROVIDERS: readonly Provider[] = [
  { provide: MeasuredVehiclesReader, useClass: PrismaMeasuredVehiclesReader },
  { provide: ActiveBinTypesReader, useClass: PrismaActiveBinTypesReader },
];
