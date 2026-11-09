import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { TakeoverReader } from "../domain/ports/takeover.reader.js";

/** Le témoin de reprise, lu dans `card_payment.takeover` — que seule la migration écrit. */
@Injectable()
export class PrismaTakeoverReader extends TakeoverReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async migratedAt(lot: string): Promise<Date | null> {
    const row = await this.prisma.cardPaymentTakeover.findUnique({ where: { lot } });
    return row?.migratedAt ?? null;
  }
}
