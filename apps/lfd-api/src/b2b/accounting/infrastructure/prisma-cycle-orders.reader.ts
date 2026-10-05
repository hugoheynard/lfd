import { vatSharesSchema } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CycleOrdersReader,
  type CycleOrder,
  type FrozenVatShare,
} from "../domain/ports/cycle-orders.reader.js";
import type { BillingCycle } from "../domain/services/billing-cycle.js";
import { billableOrderWhere } from "./billable-order-criterion.js";

/**
 * Les commandes d'un relevé, par le **même critère** que l'assiette du
 * prélèvement (`billableOrderWhere`), restreint à UNE société.
 *
 * 🔴 `company_id` est dans le `where` : c'est la société demandée, et le relevé
 * n'en montre jamais une autre.
 */
@Injectable()
export class PrismaCycleOrdersReader extends CycleOrdersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async companyName(companyId: string): Promise<string | null> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { raisonSociale: true },
    });
    return company?.raisonSociale ?? null;
  }

  async cycleOrders(companyId: string, cycle: BillingCycle): Promise<readonly CycleOrder[]> {
    const rows = await this.prisma.order.findMany({
      where: { ...billableOrderWhere(cycle.startsAt, cycle.closesAt), companyId },
      orderBy: [{ createdAt: "asc" }, { orderNumber: "asc" }],
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        subtotalCents: true,
        discountCents: true,
        voucherDiscountCents: true,
        deliveryFeeCents: true,
        lateFeeCents: true,
        vatCents: true,
        vatShares: true,
        totalCents: true,
        company: { select: { raisonSociale: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      placedAt: row.createdAt,
      siteName: row.company?.raisonSociale ?? "",
      subtotalCents: row.subtotalCents,
      discountCents: row.discountCents,
      voucherDiscountCents: row.voucherDiscountCents,
      deliveryFeeCents: row.deliveryFeeCents,
      lateFeeCents: row.lateFeeCents,
      vatCents: row.vatCents,
      vatShares: parseVatShares(row.vatShares),
      totalCents: row.totalCents,
    }));
  }
}

/**
 * Validé et non casté, comme `prisma-order.reader.ts` : une commande antérieure
 * au 2026-09-07 n'en porte pas, et un JSON d'une autre forme ne doit pas
 * devenir une ventilation. `null` envoie sa TVA en « non ventilée ».
 */
function parseVatShares(value: Prisma.JsonValue | null): readonly FrozenVatShare[] | null {
  const parsed = vatSharesSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
