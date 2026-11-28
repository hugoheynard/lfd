import type { ExemptibleCompanyView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { companyDisplayName } from "../../account/domain/services/company-display-name.js";
import { ExemptibleCompaniesReader } from "../domain/ports/exemptible-companies.reader.js";

/**
 * Les sociétés du sélecteur de l'écran admin : toutes celles dont le compte
 * n'est pas supprimé (`archivedAt: null`) — principaux et sites, chacun
 * s'exemptant pour lui seul. Deux colonnes par société, triées par nom.
 */
@Injectable()
export class PrismaExemptibleCompaniesReader extends ExemptibleCompaniesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<readonly ExemptibleCompanyView[]> {
    const rows = await this.prisma.company.findMany({
      where: { archivedAt: null },
      select: { id: true, enseigne: true, raisonSociale: true },
    });
    return rows
      .map((row) => ({ id: row.id, name: companyDisplayName(row) }))
      .sort((left, right) => left.name.localeCompare(right.name, "fr"));
  }
}
