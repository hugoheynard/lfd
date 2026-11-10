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
import {
  cycleOrderMembership,
  cycleOrderWhere,
  isCancelledAfterInvoicing,
} from "./cycle-order-membership.js";

/**
 * Les commandes d'un relevé : celles que la facture du cycle porte ou
 * portera (`cycleOrderMembership` — le relevé suit la facture, Hugo 2026-10-22),
 * restreintes à UNE société.
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
    const membership = await cycleOrderMembership(this.prisma, companyIds, cycle);
    const rows = await this.prisma.order.findMany({
      // Les commandes de ces sociétés, ET celles qu'elles paient (le payeur
      // copié, S4) : un site détaché depuis reste sur le relevé de qui l'a
      // réglé. Le tri par payeur est fait par le domaine (`billedPayerOf`).
      // Un bon facturé reste lu même annulé depuis (`cycleOrderWhere`).
      where: cycleOrderWhere(companyIds, membership),
      orderBy: [{ createdAt: "asc" }, { orderNumber: "asc" }],
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        ...BILLABLE_TOTALS_SELECT,
        companyId: true,
        billedCompanyId: true,
        status: true,
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
      // Jamais vide : `accountOrderWhere` exige une société, et un bon facturé l'a passé.
      companyId: row.companyId ?? "",
      billedCompanyId: row.billedCompanyId,
      siteName: row.company === null ? "" : companyDisplayName(row.company),
      ...billableTotalsOf(row),
      collectionState: stateOf.get(row.id) ?? "due",
      cancelledAfterInvoicing: isCancelledAfterInvoicing(membership, row.id, row.status),
    }));
  }
}

/**
 * Les totaux d'un bon sur le relevé : ses montants FACTURABLES (E6c2) — ce
 * que la facture du cycle porte. Un bon du relevé est soldé (l'assiette à
 * venir lit `settled_on`) ou déjà facturé ; un bon facturé avant E6c2 que le
 * rapprochement n'aurait pas soldé garde la recopie de la commande, qui est
 * ce que le solde y poserait.
 */
const BILLABLE_TOTALS_SELECT = {
  subtotalCents: true,
  discountCents: true,
  voucherDiscountCents: true,
  deliveryFeeCents: true,
  lateFeeCents: true,
  vatCents: true,
  vatShares: true,
  totalCents: true,
  billableSubtotalCents: true,
  billableDiscountCents: true,
  billableVoucherDiscountCents: true,
  billableDeliveryFeeCents: true,
  billableLateFeeCents: true,
  billableVatCents: true,
  billableVatShares: true,
  billableTotalCents: true,
} as const satisfies Prisma.OrderSelect;

type BillableTotalsRow = Prisma.OrderGetPayload<{ select: typeof BILLABLE_TOTALS_SELECT }>;

type CycleOrderTotals = Pick<
  CycleOrder,
  | "subtotalCents"
  | "discountCents"
  | "voucherDiscountCents"
  | "deliveryFeeCents"
  | "lateFeeCents"
  | "vatCents"
  | "vatShares"
  | "totalCents"
>;

function billableTotalsOf(row: BillableTotalsRow): CycleOrderTotals {
  if (row.billableTotalCents === null) {
    return {
      subtotalCents: row.subtotalCents,
      discountCents: row.discountCents,
      voucherDiscountCents: row.voucherDiscountCents,
      deliveryFeeCents: row.deliveryFeeCents,
      lateFeeCents: row.lateFeeCents,
      vatCents: row.vatCents,
      vatShares: parseVatShares(row.vatShares),
      totalCents: row.totalCents,
    };
  }
  // CHECK « tout ou rien » : un total posé porte les autres ; le repli ne sert qu'au typage.
  return {
    subtotalCents: row.billableSubtotalCents ?? row.subtotalCents,
    discountCents: row.billableDiscountCents ?? row.discountCents,
    voucherDiscountCents: row.billableVoucherDiscountCents ?? row.voucherDiscountCents,
    deliveryFeeCents: row.billableDeliveryFeeCents ?? row.deliveryFeeCents,
    lateFeeCents: row.billableLateFeeCents ?? row.lateFeeCents,
    vatCents: row.billableVatCents ?? row.vatCents,
    vatShares: parseVatShares(row.billableVatShares),
    totalCents: row.billableTotalCents,
  };
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
