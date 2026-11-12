import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PendingBankReturnsReader } from "../domain/ports/pending-bank-returns.reader.js";

/** La résolution d'un retour qui attend la décision du staff. */
const PENDING_RESOLUTION = "pending";

/**
 * Un retour `pending` sur une ligne qui débitait ce payeur, dans un lot de
 * cette entité. La ligne nomme le payeur débité (`debtor_company_id`), sites
 * sur leur propre mandat compris.
 */
@Injectable()
export class PrismaPendingBankReturnsReader extends PendingBankReturnsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async hasPendingReturn(legalEntityId: string, payerCompanyId: string): Promise<boolean> {
    const row = await this.prisma.collectionReturn.findFirst({
      where: {
        resolution: PENDING_RESOLUTION,
        line: { debtorCompanyId: payerCompanyId, batch: { legalEntityId } },
      },
      select: { id: true },
    });
    return row !== null;
  }
}
