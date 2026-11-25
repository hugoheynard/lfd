import type { Provider } from "@nestjs/common";

import { BackorderOpening } from "./application/backorder-opening.js";
import { BackorderOriginReader } from "./domain/ports/backorder-origin.reader.js";
import { BackorderRepository } from "./domain/ports/backorder.repository.js";
import { PrismaBackorderOriginReader } from "./infrastructure/prisma-backorder-origin.reader.js";
import { PrismaBackorderRepository } from "./infrastructure/prisma-backorder.repository.js";

/**
 * Les providers du **reliquat de commande** (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`) : le
 * dépôt, l'origine relue sous le verrou de la décision, et la naissance que
 * `ShortfallDeparture` appelle. La transformation (B3) et l'abandon (B4)
 * ajouteront leurs routes ici.
 */
export const ORDER_BACKORDER_PROVIDERS: readonly Provider[] = [
  { provide: BackorderRepository, useClass: PrismaBackorderRepository },
  { provide: BackorderOriginReader, useClass: PrismaBackorderOriginReader },
  BackorderOpening,
];
