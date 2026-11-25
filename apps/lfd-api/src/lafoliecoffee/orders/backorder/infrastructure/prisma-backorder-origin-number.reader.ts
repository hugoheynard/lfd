import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../../platform/database/prisma.service.js";
import { BackorderOriginNumberReader } from "../domain/ports/backorder-origin-number.reader.js";

/** Le numéro de la commande d'origine, par le client routé. */
@Injectable()
export class PrismaBackorderOriginNumberReader extends BackorderOriginNumberReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async numberOf(originOrderId: string): Promise<string | null> {
    const row = await this.prisma.order.findUnique({
      where: { id: originOrderId },
      select: { orderNumber: true },
    });
    return row?.orderNumber ?? null;
  }
}
