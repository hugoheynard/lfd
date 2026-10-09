import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ContactMessageAnonymizer } from "../domain/ports/contact-message.anonymizer.js";

/**
 * Adaptateur Prisma de l'anonymisation : un lot borné d'ids lu, puis vidé.
 * La condition `anonymized_at IS NULL` est répétée dans l'écriture : deux
 * passages concurrents ne vident pas deux fois, et le compte reste juste.
 */
@Injectable()
export class PrismaContactMessageAnonymizer extends ContactMessageAnonymizer {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async anonymizeBatchHandledBefore(before: Date, at: Date, limit: number): Promise<number> {
    const due = { handledAt: { lt: before }, anonymizedAt: null };
    const batch = await this.prisma.contactMessage.findMany({
      where: due,
      select: { id: true },
      orderBy: { handledAt: "asc" },
      take: limit,
    });
    if (batch.length === 0) {
      return 0;
    }
    const { count } = await this.prisma.contactMessage.updateMany({
      where: { ...due, id: { in: batch.map((row) => row.id) } },
      data: { authorName: "", authorEmail: "", authorPhone: "", body: "", anonymizedAt: at },
    });
    // Un concurrent qui en a vidé une partie arrête ce passage plus tôt : le
    // reste est rattrapé la nuit suivante.
    return count;
  }
}
