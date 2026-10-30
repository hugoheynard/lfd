import { Injectable } from "@nestjs/common";
import { companyDisplayName } from "@lfd/contracts";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ReservationCompanies } from "../domain/ports/reservation-companies.js";

/** Le nom d'affichage d'une société, lu dans le même bloc (`b2b/account` l'écrit). */
@Injectable()
export class PrismaReservationCompanies extends ReservationCompanies {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async nameOf(companyId: string): Promise<string | null> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { enseigne: true, raisonSociale: true },
    });
    return company === null ? null : companyDisplayName(company);
  }
}
