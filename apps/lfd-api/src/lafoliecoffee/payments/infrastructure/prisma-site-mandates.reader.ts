import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { PaymentMandate } from "../domain/entities/payment-mandate.js";
import { PaymentMandateRepository } from "../domain/payment-mandate.repository.js";
import { SiteMandatesReader } from "../domain/ports/site-mandates.reader.js";

/**
 * Les identifiants par une requête, l'agrégat par le dépôt : le mapping
 * ligne → mandat n'existe qu'à un endroit (`PrismaPaymentMandateRepository`).
 * Une poignée de mandats par site, au plus — la lecture en deux temps ne
 * coûte rien.
 */
@Injectable()
export class PrismaSiteMandatesReader extends SiteMandatesReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mandates: PaymentMandateRepository,
  ) {
    super();
  }

  async revocableNaming(
    siteId: string,
    debtorCompanyId: string,
  ): Promise<readonly PaymentMandate[]> {
    const rows = await this.prisma.paymentMandate.findMany({
      where: { companyId: siteId, debtorCompanyId, status: { in: ["active", "draft"] } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    const found = await Promise.all(rows.map((row) => this.mandates.findById(row.id)));
    return found.flatMap((mandate) => (mandate === null ? [] : [mandate]));
  }
}
