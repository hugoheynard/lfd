import { Module } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";

import { MediaPrismaService } from "./media-prisma.service.js";

/**
 * L'accès de la **médiathèque** à la base.
 *
 * Non `@Global`, comme son homologue du référentiel : seul `media/` a le droit
 * de lire cette table. Un accès global la rendrait atteignable depuis n'importe
 * où, soit exactement la god app qu'on essaie de ne pas fabriquer.
 *
 * Le module ne fournit pas une instance mais un **alias** de l'unique client :
 * une connexion, un cycle de vie, un seul endroit qui connecte et déconnecte.
 */
@Module({
  providers: [{ provide: MediaPrismaService, useExisting: PrismaService }],
  exports: [MediaPrismaService],
})
export class MediaDatabaseModule {}
