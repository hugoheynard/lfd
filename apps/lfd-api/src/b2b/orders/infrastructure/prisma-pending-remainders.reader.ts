import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PendingRemaindersReader } from "../domain/ports/pending-remainders.reader.js";

/** Le premier rang : celui de la commande, que son BL suit (choix 3). */
const FIRST_RANK = 1;

/** Les BL encore à remettre : ni remis, ni annulés. */
const PENDING_NOTE_STATUSES = ["planned", "prepared"] as const;

/**
 * Les restes vivants d'une commande, lus sur leurs BL. Par le client routé :
 * dans l'unité de travail de l'appelant, le BL qu'il vient de remettre est vu
 * remis.
 */
@Injectable()
export class PrismaPendingRemaindersReader extends PendingRemaindersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async anyPending(orderId: string): Promise<boolean> {
    const pending = await this.prisma.deliveryNote.count({
      where: {
        orderId,
        rank: { gt: FIRST_RANK },
        status: { in: [...PENDING_NOTE_STATUSES] },
      },
    });
    return pending > 0;
  }
}
