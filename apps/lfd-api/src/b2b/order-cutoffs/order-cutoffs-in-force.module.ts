import { Module } from "@nestjs/common";

import { SwitchedOrderCutoffs } from "./application/switched-order-cutoffs.js";
import { OrderCutoffSettingsReader } from "./domain/order-cutoff-settings.reader.js";
import { OrderCutoffRepository } from "./domain/order-cutoff.repository.js";
import { OrderCutoffsInForce } from "./domain/order-cutoffs-in-force.js";
import { PrismaOrderCutoffSettingsReader } from "./infrastructure/prisma-order-cutoff-settings.reader.js";
import { PrismaOrderCutoffRepository } from "./infrastructure/prisma-order-cutoff.repository.js";

/**
 * **Les règles d'heure limite en vigueur, sans rien d'autre** — la lecture
 * que `OrderCutoffsModule` exporte, sortie dans un module à elle (2026-10-21).
 *
 * Parce que la vitrine en a besoin (`CatalogModule`, limite d'un article plus
 * stricte que la générale — `architecture-heure-limite-de-commande.md` §9), et
 * que `OrderCutoffsModule` importe `CatalogModule` pour les jours d'une
 * opération datée : l'importer en retour fermerait un cycle. Ce module-ci
 * n'importe rien ; `OrderCutoffsModule` l'importe et le réexporte, et ses
 * lecteurs n'ont pas changé.
 */
@Module({
  providers: [
    { provide: OrderCutoffRepository, useClass: PrismaOrderCutoffRepository },
    { provide: OrderCutoffSettingsReader, useClass: PrismaOrderCutoffSettingsReader },
    { provide: OrderCutoffsInForce, useClass: SwitchedOrderCutoffs },
  ],
  exports: [OrderCutoffRepository, OrderCutoffsInForce, OrderCutoffSettingsReader],
})
export class OrderCutoffsInForceModule {}
