import { Injectable } from "@nestjs/common";
import type { LegalEntityView } from "@lfd/contracts";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { LegalEntityReader } from "../domain/ports/legal-entity.reader.js";
import { toDomain, toView } from "./legal-entity.mapper.js";

/**
 * Adaptateur Prisma de la lecture d'écran.
 *
 * Il **reconstruit l'agrégat** avant de rendre la vue, au lieu de projeter la
 * ligne directement. Un aller-retour de plus par entité, sur une table qui en
 * comptera une ou deux — et en échange, `canCollect` a une seule définition.
 * Une projection SQL équivalente (« ics non nul ET iban non nul ET pas
 * archivée ») dériverait le jour où la règle gagne une condition, et c'est
 * l'écran qui mentirait.
 */
@Injectable()
export class PrismaLegalEntityReader extends LegalEntityReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<readonly LegalEntityView[]> {
    const rows = await this.prisma.legalEntity.findMany({
      // Les vivantes d'abord : une entité archivée est une trace qu'on garde
      // pour les documents qui la citent, pas une fiche qu'on vient consulter.
      orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
    });
    return rows.map((row) => toView(toDomain(row)));
  }

  async byId(id: string): Promise<LegalEntityView | null> {
    const row = await this.prisma.legalEntity.findUnique({ where: { id } });
    return row === null ? null : toView(toDomain(row));
  }
}
