import { Module } from "@nestjs/common";

import { PimPrismaService } from "./pim-prisma.service.js";

/**
 * L'accès à la base du **référentiel PIM**.
 *
 * Non `@Global`, à la différence de son homologue B2B : seul `pim/` a le droit
 * de lire cette base, et c'est précisément ce que la frontière de contexte doit
 * empêcher d'oublier. Un accès global l'aurait rendue atteignable depuis
 * n'importe où — soit exactement la god app qu'on essaie de ne pas fabriquer.
 *
 * Pas encore importé par `AppModule` : cf. {@link PimPrismaService}.
 */
@Module({
  providers: [PimPrismaService],
  exports: [PimPrismaService],
})
export class PimDatabaseModule {}
