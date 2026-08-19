import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { AlertCompanyReader } from "../domain/ports/company.reader.js";

/** Existence seule — `select: { id }` : on ne charge pas un dossier pour un booléen. */
@Injectable()
export class PrismaAlertCompanyReader extends AlertCompanyReader {
  constructor(private readonly prisma: PrismaService) {
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
   * Une seule requête pour les deux conditions : l'appartenance est portée par
   * `memberships`, et le statut par la société — les demander séparément
   * ouvrirait une fenêtre où l'une est vraie et l'autre plus.
   */
  async isActiveMember(userId: string, companyId: string): Promise<boolean> {
    const row = await this.prisma.membership.findUnique({
      where: { userId_companyId: { userId, companyId } },
      select: { company: { select: { status: true } } },
    });
    return row?.company.status === "active";
  }
}
