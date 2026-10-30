import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PromotionPrincipalReader } from "../domain/ports/promotion-principal.reader.js";

/**
 * Le principal d'une société (`companies.parent_company_id`), relu à chaque
 * question — la structure d'aujourd'hui, comme le statut : un public
 * « société et ses sites » n'a pas de lecture datée (aucune reprise ne le pose).
 */
@Injectable()
export class PrismaPromotionPrincipalReader extends PromotionPrincipalReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async principalOf(companyId: string): Promise<string | null> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { parentCompanyId: true },
    });
    return company?.parentCompanyId ?? null;
  }
}
