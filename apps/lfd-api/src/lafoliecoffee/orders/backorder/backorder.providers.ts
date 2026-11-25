import type { Provider } from "@nestjs/common";

import { BackorderRepository } from "./domain/ports/backorder.repository.js";
import { PrismaBackorderRepository } from "./infrastructure/prisma-backorder.repository.js";

/**
 * Les providers du **reliquat de commande** (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, lot B1) :
 * le dépôt seul. Aucune route encore — la naissance (B2), la transformation
 * (B3) et l'abandon (B4) les ajouteront ici.
 */
export const ORDER_BACKORDER_PROVIDERS: readonly Provider[] = [
  { provide: BackorderRepository, useClass: PrismaBackorderRepository },
];
