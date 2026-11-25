import type { AdminOrderBillable } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderBillableReader } from "../domain/ports/order-billable.reader.js";

/**
 * Les colonnes `billable_*` d'une commande, posées à son solde par
 * `OrderBilling.closeBilling`. Les sept entiers et `settled_on` vont ensemble
 * (CHECK de la table) : un seul absent dit « pas encore soldée ».
 */
@Injectable()
export class PrismaOrderBillableReader extends OrderBillableReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async of(orderId: string): Promise<AdminOrderBillable | null> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        billableSubtotalCents: true,
        billableDiscountCents: true,
        billableVoucherDiscountCents: true,
        billableDeliveryFeeCents: true,
        billableLateFeeCents: true,
        billableVatCents: true,
        billableTotalCents: true,
        settledOn: true,
      },
    });
    if (
      row === null ||
      row.billableSubtotalCents === null ||
      row.billableDiscountCents === null ||
      row.billableVoucherDiscountCents === null ||
      row.billableDeliveryFeeCents === null ||
      row.billableLateFeeCents === null ||
      row.billableVatCents === null ||
      row.billableTotalCents === null ||
      row.settledOn === null
    ) {
      return null;
    }
    return {
      subtotalCents: row.billableSubtotalCents,
      discountCents: row.billableDiscountCents,
      voucherDiscountCents: row.billableVoucherDiscountCents,
      deliveryFeeCents: row.billableDeliveryFeeCents,
      lateFeeCents: row.billableLateFeeCents,
      vatCents: row.billableVatCents,
      totalCents: row.billableTotalCents,
      settledOn: row.settledOn.toISOString().slice(0, CIVIL_DAY_LENGTH),
    };
  }
}

/** `AAAA-MM-JJ` : une colonne `DATE` se relit à minuit UTC. */
const CIVIL_DAY_LENGTH = 10;
