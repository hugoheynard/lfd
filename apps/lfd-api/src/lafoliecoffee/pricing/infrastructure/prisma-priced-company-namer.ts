import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PricedCompanyNamer } from "../domain/ports/priced-company-namer.js";

/** Le nom d'usage d'une société, lu par son identifiant et rien d'autre. */
@Injectable()
export class PrismaPricedCompanyNamer extends PricedCompanyNamer {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async nameOf(companyId: string): Promise<string | null> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { enseigne: true, raisonSociale: true },
    });
    if (company === null) {
      return null;
    }
    // L'enseigne est facultative : sans elle, la raison sociale, comme les
    // écrans (`Company.displayName`) — jamais une chaîne vide.
    const name = company.enseigne === "" ? company.raisonSociale : company.enseigne;
    return name.trim() === "" ? null : name;
  }
}
