import type { InvoiceDossierOrderView, InvoiceDossierView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { InvoiceDossierReader } from "../../domain/ports/invoice-dossier.reader.js";
import { StatementBillingReader } from "../../domain/ports/statement-billing.reader.js";
import { STATEMENT_SCOPE } from "../../domain/services/cycle-statement-csv.js";
import type { FrozenInvoiceOrder } from "../../domain/services/invoice-dossier.types.js";
import { buildInvoiceDossier, type BuiltInvoiceDossier } from "../invoice-dossier-support.js";
import { GetInvoiceDossierQuery } from "./invoice-dossier-queries.js";

/**
 * Le dossier de facturation simulé d'un payeur pour un cycle — recalculé à
 * chaque lecture, sur le périmètre du relevé (plan simulateur, §5).
 */
@QueryHandler(GetInvoiceDossierQuery)
export class GetInvoiceDossierHandler implements IQueryHandler<
  GetInvoiceDossierQuery,
  InvoiceDossierView
> {
  constructor(
    private readonly dossiers: InvoiceDossierReader,
    private readonly billing: StatementBillingReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetInvoiceDossierQuery): Promise<InvoiceDossierView> {
    const built = await buildInvoiceDossier(
      { dossiers: this.dossiers, billing: this.billing, clock: this.clock },
      query.companyId,
      query.month,
    );
    return toView(built);
  }
}

function toView(built: BuiltInvoiceDossier): InvoiceDossierView {
  const { dossier } = built;
  return {
    companyId: built.companyId,
    companyName: built.companyName,
    cycle: {
      month: built.month.toString(),
      startsAt: built.cycle.startsAt.toISOString(),
      closesAt: built.cycle.closesAt.toISOString(),
      inProgress: built.inProgress,
    },
    scope: STATEMENT_SCOPE,
    invoice: dossier.invoice,
    orders: built.orders.map(toOrderView),
    ordersTotalCents: dossier.ordersTotalCents,
    differenceCents: dossier.differenceCents,
    gaps: dossier.gaps,
    inconsistentOrders: dossier.inconsistentOrders,
    threeGapInvariantHolds: dossier.threeGapInvariantHolds,
    otherMonthOrders: built.calendar.otherMonth,
    ordersWithoutDate: built.calendar.withoutDate,
  };
}

function toOrderView(order: FrozenInvoiceOrder): InvoiceDossierOrderView {
  return {
    reference: order.reference,
    placedAt: order.createdAt.toISOString(),
    requestedDeliveryDate: order.requestedDeliveryDate,
    lines: order.lines,
    discountCents: order.discountCents,
    voucherDiscountCents: order.voucherDiscountCents,
    deliveryFeeCents: order.deliveryFeeCents,
    deliveryVatMode: order.deliveryVatMode,
    lateFeeCents: order.lateFeeCents,
    lateFeeVatRate: order.lateFeeVatRate,
    vatShares: order.vatShares,
    vatCents: order.vatCents,
    totalCents: order.totalCents,
  };
}
