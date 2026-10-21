import { Module } from "@nestjs/common";

import { SwitchedOrderCutoffs } from "./application/switched-order-cutoffs.js";
import { OrderCutoffSettingsReader } from "./domain/order-cutoff-settings.reader.js";
import { OrderCutoffsInForce } from "./domain/order-cutoffs-in-force.js";
import { StoredOrderCutoffReader } from "./domain/stored-order-cutoff.reader.js";
import { CommerceGeneralOrderCutoffReader } from "./infrastructure/pim-general-order-cutoff.reader.js";
import { PrismaOrderCutoffSettingsReader } from "./infrastructure/prisma-order-cutoff-settings.reader.js";
import { PrismaStoredOrderCutoffReader } from "./infrastructure/prisma-stored-order-cutoff.reader.js";

/**
 * **Les règles d'heure limite en vigueur, sans rien d'autre** — la lecture
 * que `OrderCutoffsModule` exporte, sortie dans un module à elle (2026-10-21).
 *
 * Parce que la vitrine en a besoin (`CatalogModule`, limite d'un article plus
 * stricte que la générale — `limites-de-commande/limites-produit.md` §4), et
 * que `OrderCutoffsModule` importe `CatalogModule` pour les jours d'une
 * opération datée : l'importer en retour fermerait un cycle. Ce module-ci
 * n'importe rien ; `OrderCutoffsModule` l'importe et le réexporte, et ses
 * lecteurs n'ont pas changé.
 */
@Module({
  providers: [
    { provide: StoredOrderCutoffReader, useClass: PrismaStoredOrderCutoffReader },
    { provide: OrderCutoffSettingsReader, useClass: PrismaOrderCutoffSettingsReader },
    { provide: OrderCutoffsInForce, useClass: SwitchedOrderCutoffs },
    // Ce que le référentiel lit de la règle générale (2026-10-21), relié par
    // `appBootstrap/general-order-cutoff.module.ts`.
    CommerceGeneralOrderCutoffReader,
  ],
  exports: [
    StoredOrderCutoffReader,
    OrderCutoffsInForce,
    OrderCutoffSettingsReader,
    CommerceGeneralOrderCutoffReader,
  ],
})
export class OrderCutoffsInForceModule {}
