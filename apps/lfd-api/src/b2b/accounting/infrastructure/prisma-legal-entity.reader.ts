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
    // La liste porte déjà l'ensemble : « la dernière en service » se lit sans
    // seconde requête, et sans que la définition existe à deux endroits.
    const actives = rows.filter((row) => row.archivedAt === null);
    return rows.map((row) =>
      toView(toDomain(row), row.archivedAt === null && actives.length === 1),
    );
  }

  async byId(id: string): Promise<LegalEntityView | null> {
    const row = await this.prisma.legalEntity.findUnique({ where: { id } });
    if (row === null) {
      return null;
    }
    // Une seconde lecture, et elle est le prix de la fiche : contrairement à la
    // liste, une vue d'entité seule ne peut pas savoir combien il en reste.
    // `findFirst` s'arrête au premier trouvé — on demande l'existence, pas un
    // total.
    const another = await this.prisma.legalEntity.findFirst({
      where: { id: { not: id }, archivedAt: null },
      select: { id: true },
    });
    return toView(toDomain(row), row.archivedAt === null && another === null);
  }
}
