import { companyDisplayName, vatSharesSchema } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CycleOrdersReader,
  type CycleOrder,
  type FrozenVatShare,
  type StatementCompany,
} from "../domain/ports/cycle-orders.reader.js";
import type { BillingCycle } from "../domain/services/billing-cycle.js";
import { billableOrderWhere } from "./billable-order-criterion.js";

/**
 * Les commandes d'un relevé, par le **même critère** que l'assiette du
 * prélèvement (`billableOrderWhere`), restreint à UNE société.
 *
 * 🔴 `company_id` est dans le `where` : ce sont les sociétés demandées — celle
 * du relevé et les sites qui l'ont suivie en `billing` pendant le cycle — et le
 * relevé n'en montre jamais une autre. Le tri à date est fait par le domaine.
 */
@Injectable()
export class PrismaCycleOrdersReader extends CycleOrdersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async statementCompany(companyId: string): Promise<StatementCompany | null> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { raisonSociale: true, enseigne: true },
    });
    return company === null
      ? null
      : { name: company.raisonSociale, label: companyDisplayName(company) };
  }

  async cycleOrders(
    companyIds: readonly string[],
    cycle: BillingCycle,
  ): Promise<readonly CycleOrder[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        ...billableOrderWhere(cycle.startsAt, cycle.closesAt),
        // Les commandes de ces sociétés, ET celles qu'elles paient (le payeur
        // copié, S4) : un site détaché depuis reste sur le relevé de qui l'a
        // réglé. Le tri par payeur est fait par le domaine (`billedPayerOf`).
        OR: [{ companyId: { in: [...companyIds] } }, { billedCompanyId: { in: [...companyIds] } }],
      },
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
        companyId: true,
        billedCompanyId: true,
        company: { select: { raisonSociale: true, enseigne: true } },
      },
    });
    // `order_collection` n'a pas de relation vers `orders` (id opaque) : une
    // seconde lecture. L'absence de ligne vaut `due`.
    const states = await this.prisma.orderCollection.findMany({
      where: { orderId: { in: rows.map((row) => row.id) } },
      select: { orderId: true, state: true },
    });
    const stateOf = new Map(states.map((state) => [state.orderId, state.state]));
    return rows.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      placedAt: row.createdAt,
      // Jamais vide : `billableOrderWhere` exige une société.
      companyId: row.companyId ?? "",
      billedCompanyId: row.billedCompanyId,
      siteName: row.company === null ? "" : companyDisplayName(row.company),
      subtotalCents: row.subtotalCents,
      discountCents: row.discountCents,
      voucherDiscountCents: row.voucherDiscountCents,
      deliveryFeeCents: row.deliveryFeeCents,
      lateFeeCents: row.lateFeeCents,
      vatCents: row.vatCents,
      vatShares: parseVatShares(row.vatShares),
      totalCents: row.totalCents,
      collectionState: stateOf.get(row.id) ?? "due",
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
