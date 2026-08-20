import { Module } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PimPrismaService } from "./pim-prisma.service.js";

/**
 * L'accès du **référentiel** à la base.
 *
 * Non `@Global`, à la différence de son homologue : seul `pim/` a le droit de
 * lire ces tables, et c'est précisément ce que la frontière de contexte doit
 * empêcher d'oublier. Un accès global l'aurait rendue atteignable depuis
 * n'importe où — soit exactement la god app qu'on essaie de ne pas fabriquer.
 *
 * Depuis B4, `PimPrismaService` n'ouvre plus sa propre connexion : il DÉSIGNE
 * l'unique client, dont le schéma `pim` fait maintenant partie. Le module ne
 * fournit donc plus une instance mais un **alias** — une connexion, un cycle de
 * vie, un seul endroit qui connecte et déconnecte.
 */
@Module({
  providers: [{ provide: PimPrismaService, useExisting: PrismaService }],
  exports: [PimPrismaService],
})
export class PimDatabaseModule {}
