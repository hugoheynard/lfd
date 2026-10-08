import type {
  InvoiceDossierHistoryEventView,
  InvoiceDossierOrderView,
  InvoiceDossierView,
} from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderDeliveryHistoryReader } from "../../../../delivery/channels/commerce/index.js";
import { OrderHandoverHistoryReader } from "../../../../handover/channels/commerce/index.js";
import { Clock } from "../../../../platform/time/clock.js";
import { InvoiceDossierReader } from "../../domain/ports/invoice-dossier.reader.js";
import { InvoiceIssuersReader } from "../../domain/ports/invoice-issuers.reader.js";
import { StatementBuyerReader } from "../../domain/ports/statement-buyer.reader.js";
import {
  payerIssuanceBlockers,
  type InvoiceIssuanceBlocker,
} from "../../domain/services/invoice-issuance-blockers.js";
import { StatementBillingReader } from "../../domain/ports/statement-billing.reader.js";
import { STATEMENT_SCOPE } from "../../domain/services/cycle-statement-csv.js";
import type {
  DossierHistoryEvent,
  DossierOrderRecord,
} from "../../domain/services/invoice-dossier-history.js";
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
    private readonly handovers: OrderHandoverHistoryReader,
    private readonly deliveries: OrderDeliveryHistoryReader,
    private readonly clock: Clock,
    private readonly issuers: InvoiceIssuersReader,
    private readonly buyers: StatementBuyerReader,
  ) {}

  async execute(query: GetInvoiceDossierQuery): Promise<InvoiceDossierView> {
    const built = await buildInvoiceDossier(
      {
        dossiers: this.dossiers,
        billing: this.billing,
        handovers: this.handovers,
        deliveries: this.deliveries,
        clock: this.clock,
      },
      query.companyId,
      query.month,
    );
    return toView(built, await this.issuanceBlockers(built.companyId));
  }

  /**
   * Ce qui empêcherait d'émettre la facture de ce payeur (E0) — sur la vue
   * seule : les CSV disent les bons et la facture calculée, pas l'état des
   * fiches au moment de l'export.
   */
  private async issuanceBlockers(payerId: string): Promise<readonly InvoiceIssuanceBlocker[]> {
    const [issuers, buyers] = await Promise.all([
      this.issuers.activeIssuers(),
      this.buyers.buyersOf([payerId]),
    ]);
    return payerIssuanceBlockers(issuers, buyers.get(payerId) ?? null);
  }
}

function toView(
  built: BuiltInvoiceDossier,
  issuanceBlockers: readonly InvoiceIssuanceBlocker[],
): InvoiceDossierView {
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
    neverHandedOver: built.neverHandedOver,
    orders: built.records.map(toOrderView),
    ordersTotalCents: dossier.ordersTotalCents,
    differenceCents: dossier.differenceCents,
    gaps: dossier.gaps,
    inconsistentOrders: dossier.inconsistentOrders,
    threeGapInvariantHolds: dossier.threeGapInvariantHolds,
    otherMonthOrders: built.calendar.otherMonth,
    ordersWithoutDate: built.calendar.withoutDate,
    issuanceBlockers,
  };
}

function toOrderView({ order, place, history }: DossierOrderRecord): InvoiceDossierOrderView {
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
    place,
    history: history.events.map(toEventView),
    actualDeliveryDay: history.actualDeliveryDay,
  };
}

function toEventView(event: DossierHistoryEvent): InvoiceDossierHistoryEventView {
  return {
    kind: event.kind,
    at: event.at.toISOString(),
    serviceDay: event.serviceDay,
    via: event.via,
  };
}
