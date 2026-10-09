import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { UnsettledShopOrderReader } from "../domain/ports/unsettled-shop-order.reader.js";
import type { UnsettledSettlement } from "../domain/ports/unsettled-settlement.reader.js";
import { unsettledShopOrderWhere } from "./unsettled-shop-order.where.js";

const SETTLEMENT_SELECT = {
  id: true,
  stripePaymentIntentId: true,
  loyaltyVoucherId: true,
} as const;

interface SettlementRow {
  readonly id: string;
  readonly stripePaymentIntentId: string | null;
  readonly loyaltyVoucherId: string | null;
}

/**
 * Adaptateur Prisma de l'expiration boutique.
 *
 * Aucun mur `company_id` : c'est une passe d'exploitation, déclenchée par le
 * cron ou par la passation, et le périmètre exclut toute société.
 */
@Injectable()
export class PrismaUnsettledShopOrderReader extends UnsettledShopOrderReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async placedBefore(cutoff: Date): Promise<readonly UnsettledSettlement[]> {
    const rows = await this.prisma.order.findMany({
      where: { ...unsettledShopOrderWhere(), createdAt: { lt: cutoff } },
      orderBy: { createdAt: "asc" },
      select: SETTLEMENT_SELECT,
    });
    return rows.map(toSettlement);
  }

  async replacedBy(newOrderId: string): Promise<readonly UnsettledSettlement[]> {
    // La nouvelle commande doit être elle-même du périmètre : une commande
    // passée par le staff pour ce client ne remplace rien (§4.4).
    const placed = await this.prisma.order.findFirst({
      where: { id: newOrderId, ...unsettledShopOrderWhere() },
      select: { placedByUserId: true },
    });
    if (placed === null) {
      return [];
    }
    const rows = await this.prisma.order.findMany({
      where: {
        ...unsettledShopOrderWhere(),
        placedByUserId: placed.placedByUserId,
        id: { not: newOrderId },
      },
      orderBy: { createdAt: "asc" },
      select: SETTLEMENT_SELECT,
    });
    return rows.map(toSettlement);
  }
}

function toSettlement(row: SettlementRow): UnsettledSettlement {
  return {
    orderId: row.id,
    paymentIntentId: row.stripePaymentIntentId,
    loyaltyVoucherId: row.loyaltyVoucherId,
  };
}
