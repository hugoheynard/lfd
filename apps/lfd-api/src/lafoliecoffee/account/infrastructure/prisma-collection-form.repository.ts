import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CollectionFormHistory } from "../domain/entities/collection-form-history.js";
import { CollectionFormRepository } from "../domain/ports/collection-form.repository.js";

/**
 * Le dépôt des formes de prélèvement. Une période s'identifie par (société,
 * début) — la clé primaire —, donc `save` est un `upsert` par période, les
 * fermetures d'abord : la contrainte d'exclusion ne doit pas voir, le temps
 * d'une instruction, deux périodes ouvertes.
 */
@Injectable()
export class PrismaCollectionFormRepository extends CollectionFormRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(companyId: string): Promise<CollectionFormHistory> {
    const rows = await this.prisma.companyCollectionForm.findMany({
      where: { companyId },
      orderBy: { validFrom: "asc" },
      select: { form: true, validFrom: true, validTo: true },
    });
    return CollectionFormHistory.reconstitute(companyId, rows);
  }

  async save(history: CollectionFormHistory): Promise<void> {
    const ordered = [...history.periods].sort(
      (a, b) => Number(a.validTo === null) - Number(b.validTo === null),
    );
    for (const period of ordered) {
      await this.prisma.companyCollectionForm.upsert({
        where: {
          companyId_validFrom: { companyId: history.companyId, validFrom: period.validFrom },
        },
        create: {
          companyId: history.companyId,
          form: period.form,
          validFrom: period.validFrom,
          validTo: period.validTo,
        },
        update: { validTo: period.validTo },
      });
    }
  }
}
