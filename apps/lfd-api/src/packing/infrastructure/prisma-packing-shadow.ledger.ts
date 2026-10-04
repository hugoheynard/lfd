import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  PackingShadowLedger,
  type ShadowOrderToDraw,
  type ShadowReceipt,
} from "../domain/ports/packing-shadow.ledger.js";

/**
 * L'adaptateur Prisma de l'ombre. Il tourne dans l'unité de travail que la
 * garde du relais ouvre pour chaque livraison : le reçu et la réserve partent
 * ensemble, ou rien ne part.
 */
@Injectable()
export class PrismaPackingShadowLedger extends PackingShadowLedger {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async drawOrder(order: ShadowOrderToDraw): Promise<void> {
    await this.prisma.packingOrder.createMany({
      data: [
        {
          serviceDay: order.serviceDay,
          orderId: order.orderId,
          reference: order.reference,
          customerLabel: order.customerLabel,
          fulfillmentMethod: order.fulfillmentMethod,
          dueAt: order.dueAt,
          drawnAt: order.drawnAt,
        },
      ],
      skipDuplicates: true,
    });
    await this.prisma.packingLine.createMany({
      data: order.lines.map((line) => ({
        serviceDay: order.serviceDay,
        orderId: order.orderId,
        sku: line.sku,
        productName: line.productName,
        quantity: line.quantity,
      })),
      skipDuplicates: true,
    });
  }

  /**
   * Le reçu par `ON CONFLICT DO NOTHING`, puis la réserve par un
   * `INSERT … ON CONFLICT DO UPDATE` : deux livraisons simultanées sur la même
   * réserve s'additionnent, là où un `upsert` Prisma se disputerait la création.
   */
  async receive(receipt: ShadowReceipt): Promise<boolean> {
    const { count } = await this.prisma.packingReceipt.createMany({
      data: [
        {
          id: receipt.id,
          kind: receipt.kind,
          serviceDay: receipt.serviceDay,
          sku: receipt.sku,
          quantity: receipt.quantity,
          receivedAt: receipt.receivedAt,
        },
      ],
      skipDuplicates: true,
    });
    if (count === 0) {
      return false;
    }
    const received = receipt.kind === "handoff" ? receipt.quantity : 0;
    const returned = receipt.kind === "return" ? receipt.quantity : 0;
    await this.prisma.$executeRaw`
      INSERT INTO "packing"."packing_stock" ("service_day", "sku", "received", "returned")
      VALUES (${receipt.serviceDay}, ${receipt.sku}, ${received}, ${returned})
      ON CONFLICT ("service_day", "sku") DO UPDATE
         SET "received" = "packing"."packing_stock"."received" + EXCLUDED."received",
             "returned" = "packing"."packing_stock"."returned" + EXCLUDED."returned"`;
    return true;
  }
}
