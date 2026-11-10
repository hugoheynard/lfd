import {
  type CompanyOrderAuthorView,
  companyDisplayName,
  vatSharesSchema,
  type VatShareView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { OrderStatus, type Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CompanyOrderSummaryReader,
  type CompanyOrderSummaryScope,
} from "../domain/ports/company-order-summary.reader.js";
import type { OrderSummarySource } from "../domain/services/order-summary.js";
import { companyOrderWallOf } from "./company-order-wall.js";
import { orderLineSaleUnitOf } from "./order-line-row.js";

const SUMMARY_SELECT = {
  id: true,
  orderNumber: true,
  companyId: true,
  status: true,
  paymentStatus: true,
  requestedDeliveryDate: true,
  fulfillmentMethod: true,
  placedByStaffId: true,
  placedBy: { select: { firstName: true, lastName: true, email: true } },
  subtotalCents: true,
  discountCents: true,
  voucherDiscountCents: true,
  deliveryFeeCents: true,
  lateFeeCents: true,
  vatCents: true,
  vatShares: true,
  totalCents: true,
  company: { select: { raisonSociale: true, enseigne: true } },
  lines: {
    select: {
      sku: true,
      productNameSnapshot: true,
      quantity: true,
      saleUnit: true,
      lineTotalCents: true,
    },
  },
} as const;

type SummaryRow = Prisma.OrderGetPayload<{ select: typeof SUMMARY_SELECT }>;

/**
 * Les commandes d'un récapitulatif, en UNE lecture, sous le mur de la liste
 * (`plan-recapitulatif-des-commandes.md`, §6.5). Pas de `CUSTOMER_VISIBLE` :
 * une commande au paiement en attente ou refusé est lue pour être NOMMÉE
 * exclue, jamais sommée — c'est le domaine qui l'écarte.
 */
@Injectable()
export class PrismaCompanyOrderSummaryReader extends CompanyOrderSummaryReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ordersFor(scope: CompanyOrderSummaryScope): Promise<readonly OrderSummarySource[]> {
    const rows = await this.prisma.order.findMany({
      where: { AND: [companyOrderWallOf(scope), { id: { in: [...scope.orderIds] } }] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: SUMMARY_SELECT,
    });
    return rows.flatMap(sourceOf);
  }
}

/** Une commande sans société n'entre pas sous ce mur ; écartée par sûreté. */
function sourceOf(row: SummaryRow): readonly OrderSummarySource[] {
  if (row.companyId === null || row.company === null) {
    return [];
  }
  return [
    {
      id: row.id,
      orderNumber: row.orderNumber,
      companyId: row.companyId,
      companyName: companyDisplayName(row.company),
      day:
        row.requestedDeliveryDate === null
          ? null
          : row.requestedDeliveryDate.toISOString().slice(0, 10),
      fulfillmentMethod: row.fulfillmentMethod,
      author: authorOf(row),
      cancelled: row.status === OrderStatus.cancelled,
      paymentStatus: row.paymentStatus,
      subtotalCents: row.subtotalCents,
      discountCents: row.discountCents,
      voucherDiscountCents: row.voucherDiscountCents,
      deliveryFeeCents: row.deliveryFeeCents,
      lateFeeCents: row.lateFeeCents,
      vatCents: row.vatCents,
      vatShares: vatSharesOf(row.vatShares),
      totalCents: row.totalCents,
      lines: row.lines.map((line) => ({
        sku: line.sku,
        name: line.productNameSnapshot,
        quantity: line.quantity,
        saleUnit: orderLineSaleUnitOf(line.sku, line.saleUnit),
        lineTotalCents: line.lineTotalCents,
      })),
    },
  ];
}

/**
 * Qui a passé la commande — la même règle que la liste (C1, §7.6) : l'équipe
 * si elle l'a saisie, sinon le nom du client, son e-mail à défaut.
 */
function authorOf(row: SummaryRow): CompanyOrderAuthorView {
  if (row.placedByStaffId !== null) {
    return { kind: "team" };
  }
  const name = `${row.placedBy.firstName} ${row.placedBy.lastName}`.trim();
  return { kind: "customer", name: name === "" ? row.placedBy.email : name };
}

function vatSharesOf(value: Prisma.JsonValue | null): readonly VatShareView[] | null {
  const parsed = vatSharesSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
