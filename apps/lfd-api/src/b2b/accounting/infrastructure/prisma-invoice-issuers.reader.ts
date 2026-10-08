import { Injectable } from "@nestjs/common";

import { FieldCipher } from "../../../platform/crypto/field-cipher.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { InvoiceIssuersReader } from "../domain/ports/invoice-issuers.reader.js";
import type { InvoiceSellerFacts } from "../domain/services/invoice-issuance-blockers.js";
import { toDomain } from "./legal-entity.mapper.js";

/**
 * Les entités en service, rebâties en agrégat le temps d'en tirer les faits
 * vendeur : la définition de « vendeur complet » reste celle de l'agrégat, et
 * ses value objects revalident la ligne au passage.
 */
@Injectable()
export class PrismaInvoiceIssuersReader extends InvoiceIssuersReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
  ) {
    super();
  }

  async activeIssuers(): Promise<readonly InvoiceSellerFacts[]> {
    const rows = await this.prisma.legalEntity.findMany({
      where: { archivedAt: null },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => toDomain(row, this.cipher).invoiceSellerFacts());
  }
}
