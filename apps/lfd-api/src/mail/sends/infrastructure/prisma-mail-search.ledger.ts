import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { MailSearchLedger, type StoredMailSearch } from "../domain/ports/mail-search.ledger.js";

/** Une recherche et ses envois trouvés, sans son empreinte. */
@Injectable()
export class PrismaMailSearchLedger extends MailSearchLedger {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async searchOf(searchId: string): Promise<StoredMailSearch | null> {
    const row = await this.prisma.mailRecipientSearch.findUnique({
      where: { id: searchId },
      select: {
        id: true,
        searchedBy: true,
        searchedAt: true,
        hits: { select: { mailRequestId: true } },
      },
    });
    return row === null
      ? null
      : {
          id: row.id,
          staffId: row.searchedBy,
          at: row.searchedAt,
          sendIds: row.hits.map((hit) => hit.mailRequestId),
        };
  }
}
