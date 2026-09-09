import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PricedCompanyReader } from "../domain/ports/priced-company.reader.js";

/** L'existence d'une société, lue par son identifiant et rien d'autre. */
@Injectable()
export class PrismaPricedCompanyReader extends PricedCompanyReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async exists(companyId: string): Promise<boolean> {
    // `select: { id: true }` : on ne veut pas la société, on veut savoir si elle
    // est là. Ramener ses colonnes donnerait à l'appelant de quoi lire un fait
    // d'un autre contexte sans l'avoir demandé.
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    return company !== null;
  }
}
