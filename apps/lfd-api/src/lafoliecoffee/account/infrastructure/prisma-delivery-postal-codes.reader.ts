import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  DeliveryPostalCodesReader,
  type DeliveryPostalCode,
} from "../domain/ports/delivery-postal-codes.reader.js";

/** Les adresses `delivery` non archivées des sociétés dont le statut n'est pas `terminated`. */
@Injectable()
export class PrismaDeliveryPostalCodesReader extends DeliveryPostalCodesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ofServedCompanies(): Promise<readonly DeliveryPostalCode[]> {
    const rows = await this.prisma.address.findMany({
      where: { kind: "delivery", archivedAt: null, company: { status: { not: "terminated" } } },
      select: {
        codePostal: true,
        ville: true,
        companyId: true,
        company: { select: { enseigne: true, raisonSociale: true } },
      },
      orderBy: { codePostal: "asc" },
    });
    return rows.map((row) => ({
      postalCode: row.codePostal.trim(),
      city: row.ville.trim(),
      companyId: row.companyId,
      companyName: row.company.enseigne.trim() || row.company.raisonSociale,
    }));
  }
}
