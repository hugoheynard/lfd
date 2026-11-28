import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { companyDisplayName } from "../../account/domain/services/company-display-name.js";
import type { ExemptionCompanyFacts } from "../domain/feature-company-exemption.js";
import { ExemptionCompanyLookup } from "../domain/ports/exemption-company.lookup.js";

/**
 * La société qu'un ajout désigne, lue en `companies` (même bloc, lecture
 * seule, par la clé primaire) : son nom d'usage et son archivage.
 */
@Injectable()
export class PrismaExemptionCompanyLookup extends ExemptionCompanyLookup {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async describe(companyId: string): Promise<ExemptionCompanyFacts | null> {
    const row = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, enseigne: true, raisonSociale: true, archivedAt: true },
    });
    return row === null
      ? null
      : { id: row.id, name: companyDisplayName(row), archived: row.archivedAt !== null };
  }
}
