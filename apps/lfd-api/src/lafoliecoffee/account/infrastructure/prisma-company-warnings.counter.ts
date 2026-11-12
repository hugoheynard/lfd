import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { CompanyWarningsCounter } from "../domain/ports/company-warnings.counter.js";
import { companyWarnings } from "../domain/services/company-warnings.js";
import { WARNING_SELECT, warningInputOf } from "./company-warnings.projection.js";

/**
 * Compte les avertissements en lisant les seules colonnes du calcul.
 *
 * Pas un `COUNT` SQL : la règle dépend de l'instant (un dossier en attente
 * depuis plus de quatorze jours) et du principal suivi, et la récrire en SQL en
 * ferait une seconde règle qui divergerait de la galerie. Cross-tenant comme la
 * liste : l'auth staff est le seul mur.
 */
@Injectable()
export class PrismaCompanyWarningsCounter extends CompanyWarningsCounter {
  constructor(
    private readonly prisma: PrismaService,
    /** L'âge d'un dossier en attente se juge à l'instant de la requête. */
    private readonly clock: Clock,
  ) {
    super();
  }

  async count(): Promise<number> {
    const rows = await this.prisma.company.findMany({ select: WARNING_SELECT });
    const now = this.clock.now();
    return rows.reduce(
      (total, row) => total + companyWarnings(warningInputOf(row, now), now).length,
      0,
    );
  }
}
