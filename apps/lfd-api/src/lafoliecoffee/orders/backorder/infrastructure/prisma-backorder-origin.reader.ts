import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../../platform/database/prisma.service.js";
import {
  BackorderOriginReader,
  type BackorderOrigin,
} from "../domain/ports/backorder-origin.reader.js";

/**
 * L'origine du reliquat, par le client routé : dans l'unité de travail de la
 * décision, sous le verrou de la commande qu'elle tient déjà.
 */
@Injectable()
export class PrismaBackorderOriginReader extends BackorderOriginReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ofLocked(orderId: string): Promise<BackorderOrigin | null> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        companyId: true,
        placedByUserId: true,
        lines: { select: { sku: true, quantity: true, saleUnit: true } },
      },
    });
    if (row === null) {
      return null;
    }
    return { companyId: row.companyId, buyerUserId: row.placedByUserId, lines: row.lines };
  }
}
