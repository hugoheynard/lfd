import type { Provider } from "@nestjs/common";

import { ProposalCapacity } from "./application/proposal-capacity.js";
import { DeclaredBinsReader } from "./domain/ports/declared-bins.reader.js";
import {
  ActiveBinTypesReader,
  MeasuredVehiclesReader,
} from "./domain/ports/composition-prerequisites.readers.js";
import {
  PrismaActiveBinTypesReader,
  PrismaMeasuredVehiclesReader,
} from "./infrastructure/prisma-composition-prerequisites.readers.js";
import { PrismaDeclaredBinsReader } from "./infrastructure/prisma-declared-bins.reader.js";

/** Le socle de la composition (CA-D3, CA4) : ce que « Proposer », le retrait et l'archivage lisent. */
export const COMPOSITION_PREREQUISITES_PROVIDERS: readonly Provider[] = [
  { provide: MeasuredVehiclesReader, useClass: PrismaMeasuredVehiclesReader },
  { provide: ActiveBinTypesReader, useClass: PrismaActiveBinTypesReader },
  // La place des véhicules et la demande en bacs des commandes (CA4).
  { provide: DeclaredBinsReader, useClass: PrismaDeclaredBinsReader },
  ProposalCapacity,
];
