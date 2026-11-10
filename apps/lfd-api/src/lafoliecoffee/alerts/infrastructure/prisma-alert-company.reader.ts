import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { readCompanyStanding } from "../../shared/company-standing/infrastructure/read-company-standing.js";
import { AlertCompanyReader } from "../domain/ports/company.reader.js";

/** Existence seule — `select: { id }` : on ne charge pas un dossier pour un booléen. */
@Injectable()
export class PrismaAlertCompanyReader extends AlertCompanyReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async exists(companyId: string): Promise<boolean> {
    const row = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Une seule requête pour les deux conditions — la place de la personne
   * (propre, ou héritée du principal : S6, R1) et le statut de la société :
   * les demander séparément ouvrirait une fenêtre où l'une est vraie et
   * l'autre plus.
   */
  async isActiveMember(userId: string, companyId: string): Promise<boolean> {
    const standing = await readCompanyStanding(this.prisma, this.clock.now(), userId, companyId);
    return standing?.companyStatus === "active";
  }
}
