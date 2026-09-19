import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { NotebookCompanies } from "../domain/ports/notebook-companies.js";

/** L'existence et le nom d'une société, lus dans la table du même bloc (`b2b`). */
@Injectable()
export class PrismaNotebookCompanies extends NotebookCompanies {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async exists(companyId: string): Promise<boolean> {
    return (await this.prisma.company.count({ where: { id: companyId } })) > 0;
  }

  async nameOf(companyId: string): Promise<string | null> {
    const row = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { enseigne: true, raisonSociale: true },
    });
    if (row === null) {
      return null;
    }
    // L'enseigne est facultative : sans elle, le client se nomme par sa raison
    // sociale — la règle de `Company.displayName()`.
    return row.enseigne === "" ? row.raisonSociale : row.enseigne;
  }
}
