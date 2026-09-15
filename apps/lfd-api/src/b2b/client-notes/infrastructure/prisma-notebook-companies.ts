import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { NotebookCompanies } from "../domain/ports/notebook-companies.js";

/** L'existence d'une société, lue dans la table du même bloc (`b2b`). */
@Injectable()
export class PrismaNotebookCompanies extends NotebookCompanies {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async exists(companyId: string): Promise<boolean> {
    return (await this.prisma.company.count({ where: { id: companyId } })) > 0;
  }
}
