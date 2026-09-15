import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { IssuedDraftsReader } from "../domain/ports/issued-drafts.reader.js";

/** Adaptateur Prisma : les brouillons d'un émetteur, par l'identifiant seul. */
@Injectable()
export class PrismaIssuedDraftsReader extends IssuedDraftsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async draftIdsIssuedBy(creditorId: string): Promise<readonly string[]> {
    const rows = await this.prisma.paymentMandate.findMany({
      where: { creditorId, status: "draft" },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => row.id);
  }
}
