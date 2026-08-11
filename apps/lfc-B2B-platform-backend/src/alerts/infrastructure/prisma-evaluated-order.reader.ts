import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import {
  EvaluatedOrderReader,
  type EvaluatedOrder,
} from "../domain/ports/evaluated-order.reader.js";

/**
 * La commande à évaluer, réduite à ce que les alertes regardent — et l'état de sa
 * société lu **dans la même requête** : décider d'évaluer suppose de savoir si le
 * compte est actif, et deux allers-retours pour une décision binaire n'ont pas de
 * raison d'être.
 */
@Injectable()
export class PrismaEvaluatedOrderReader extends EvaluatedOrderReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async read(orderId: string): Promise<EvaluatedOrder | null> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        companyId: true,
        company: { select: { status: true, raisonSociale: true } },
        lines: { select: { sku: true, productNameSnapshot: true, quantity: true } },
      },
    });
    if (row === null) {
      return null;
    }
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      companyId: row.companyId,
      companyActive: row.company?.status === "active",
      companyName: row.company?.raisonSociale ?? "",
      lines: row.lines.map((line) => ({
        sku: line.sku,
        productName: line.productNameSnapshot,
        quantity: line.quantity,
      })),
    };
  }
}
