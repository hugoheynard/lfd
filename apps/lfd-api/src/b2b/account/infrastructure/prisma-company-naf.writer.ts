import { Injectable } from "@nestjs/common";

import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { Company } from "../domain/entities/company.js";
import { CompanyNafWriter } from "../domain/ports/company-naf.writer.js";

/** Un agrégat sans identifiant n'a jamais été déclaré : rien à compléter en base. */
export class NafWriteOnUnsavedCompanyError extends TechnicalError {
  constructor() {
    super(
      "account.company_naf.unsaved_company",
      "Le code NAF ne s'enregistre que sur une société déjà déclarée : l'agrégat reçu n'a pas d'identifiant.",
    );
  }
}

/** N'écrit QUE `naf_code` : toute autre colonne appartient à un autre geste. */
@Injectable()
export class PrismaCompanyNafWriter extends CompanyNafWriter {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async saveNaf(company: Company): Promise<void> {
    const id = company.id;
    if (id === null) {
      throw new NafWriteOnUnsavedCompanyError();
    }
    await this.prisma.company.update({ where: { id }, data: { nafCode: company.nafCode } });
  }
}
