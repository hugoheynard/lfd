import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CompanyNamer, type CompanyIdentity } from "../domain/ports/company-namer.js";

/**
 * Lit l'enseigne et la raison sociale d'une société, pour les **figer** dans le
 * journal — pas pour les rejoindre à l'affichage.
 *
 * Une enseigne change ; une commande passée en 2024 doit continuer de nommer le
 * client comme il s'appelait en 2024. C'est le même raisonnement que pour le nom
 * de l'acteur, et il coûte une lecture par événement, sur un chemin déjà
 * best-effort.
 */
@Injectable()
export class PrismaCompanyNamer extends CompanyNamer {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async nameOf(companyId: string): Promise<CompanyIdentity | null> {
    const row = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { enseigne: true, raisonSociale: true },
    });
    if (row === null) {
      return null;
    }
    // L'enseigne est facultative en base ; sans elle, le client se nomme par sa
    // raison sociale plutôt que par une chaîne vide.
    return {
      enseigne: row.enseigne === "" ? row.raisonSociale : row.enseigne,
      raisonSociale: row.raisonSociale,
    };
  }
}
