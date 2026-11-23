import { Module } from "@nestjs/common";

import { PimDatabaseModule } from "../infra/database/pim-database.module.js";
import { ExcludeProductFromLimitHandler } from "./application/exclude-product-from-limit.js";
import { ExplainProductOrderTimeLimitHandler } from "./application/explain-product-order-time-limit.js";
import { IncludeProductInLimitHandler } from "./application/include-product-in-limit.js";
import { GetGeneralOrderCutoffHandler } from "./application/get-general-order-cutoff.js";
import { ListOrderTimeLimitsHandler } from "./application/list-order-time-limits.js";
import { ArchiveOrderTimeLimitHandler } from "./application/archive-order-time-limit.js";
import { RestoreOrderTimeLimitHandler } from "./application/restore-order-time-limit.js";
import { SetOrderTimeLimitHandler } from "./application/set-order-time-limit.js";
import { LimitScopeNamer } from "./domain/ports/limit-scope.namer.js";
import { OrderTimeLimitRepository } from "./domain/ports/order-time-limit.repository.js";
import { OrderTimeLimitController } from "./http/order-time-limit.controller.js";
import { PrismaLimitScopeNamer } from "./infrastructure/prisma-limit-scope.namer.js";
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
    { provide: OrderTimeLimitRepository, useClass: PrismaOrderTimeLimitRepository },
    { provide: LimitScopeNamer, useClass: PrismaLimitScopeNamer },
    SetOrderTimeLimitHandler,
    ArchiveOrderTimeLimitHandler,
    RestoreOrderTimeLimitHandler,
    ExcludeProductFromLimitHandler,
    IncludeProductInLimitHandler,
    ListOrderTimeLimitsHandler,
    // `ProductLineageReader` et `LimitTargetLabelsReader` sont fournis par
    // `appBootstrap/` (global) : le catalogue les implémente.
    ExplainProductOrderTimeLimitHandler,
    // `GeneralOrderCutoffReader` est fourni par `appBootstrap/` (global) : le
    // commerce l'implémente, et ce module ne peut pas l'importer.
    GetGeneralOrderCutoffHandler,
  ],
  exports: [OrderTimeLimitRepository],
})
export class OrderTimeLimitationModule {}
