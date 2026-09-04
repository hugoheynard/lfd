import { Module } from "@nestjs/common";

import { PimDatabaseModule } from "../infra/database/pim-database.module.js";
import { PimIdGenerator, UuidV7Generator } from "../infra/id/pim-id-generator.js";
import { ListOrderTimeLimitsHandler } from "./application/list-order-time-limits.js";
import { RemoveOrderTimeLimitHandler } from "./application/remove-order-time-limit.js";
import { SetOrderTimeLimitHandler } from "./application/set-order-time-limit.js";
import { OrderTimeLimitRepository } from "./domain/ports/order-time-limit.repository.js";
import { OrderTimeLimitController } from "./http/order-time-limit.controller.js";
import { PrismaOrderTimeLimitRepository } from "./infrastructure/prisma-order-time-limit.repository.js";

/**
 * Contexte **order-time-limitation** — jusqu'à quand on prend commande.
 *
 * Un contexte à part, et pas un coin du catalogue : ce qu'il porte n'est ni une
 * propriété de la fiche (un préavis n'est pas un ingrédient) ni un réglage de
 * plateforme. C'est une **contrainte de production**, exprimée sur des portées
 * de catalogue parce que c'est là qu'elle se centralise le plus simplement.
 *
 * Il vit dans le référentiel pour une raison assumée et non pour une raison
 * théorique : la contrainte est de production, mais le référentiel est le seul
 * endroit où « toute la production », « la viennoiserie » et « cet entremets »
 * se nomment déjà, avec leur arbre. La reconstruire ailleurs aurait demandé de
 * dupliquer cet arbre.
 *
 * Exporte son repository : le canal B2B en a besoin pour résoudre la limite de
 * chaque déclinaison avant de l'envoyer à la plateforme.
 */
@Module({
  imports: [PimDatabaseModule],
  controllers: [OrderTimeLimitController],
  providers: [
    { provide: PimIdGenerator, useClass: UuidV7Generator },
    { provide: OrderTimeLimitRepository, useClass: PrismaOrderTimeLimitRepository },
    SetOrderTimeLimitHandler,
    RemoveOrderTimeLimitHandler,
    ListOrderTimeLimitsHandler,
  ],
  exports: [OrderTimeLimitRepository],
})
export class OrderTimeLimitationModule {}
