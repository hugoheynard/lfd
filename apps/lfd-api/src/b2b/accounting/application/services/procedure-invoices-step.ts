import type {
  CollectionProcedureInvoicesView,
  MonthlyClosureView,
  UnconfirmedDeliveryView,
} from "@lfd/contracts";
import { instantToLocal } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { ClosureBatchesReader } from "../../domain/ports/closure-batches.reader.js";
import { UninvoicedOrdersReader } from "../../domain/ports/monthly-invoicing.reader.js";
import { MonthlyInvoicesReader } from "../../domain/ports/monthly-invoices.reader.js";
import {
  UnconfirmedDeliveriesReader,
  type UnconfirmedDelivery,
} from "../../domain/ports/unconfirmed-deliveries.reader.js";
import type { BillingFollow } from "../../domain/ports/statement-billing.reader.js";
import { billedPayerOf } from "../../domain/services/billed-payer.js";
import { invoicesStatus } from "../../domain/services/collection-procedure-invoices.js";
import type { InvoicingCalendar } from "../../domain/services/invoicing-calendar.js";
import { lastDayOf } from "../../domain/services/invoicing-closures.js";
import { ordersByPayer } from "../../domain/services/monthly-invoicing.js";
import { closureView } from "../monthly-closures-support.js";
import { unique } from "../unique-ids.js";
import { unconfirmedDeliveryView } from "../unconfirmed-delivery-view.js";

/** Ce que l'onglet lit d'une procédure. */
export interface ProcedureInvoicesQuery {
  readonly legalEntityId: string;
  readonly calendar: InvoicingCalendar;
  /** La clôture de la procédure ; `null` : aucune à montrer. */
  readonly closesAt: Date | null;
  readonly now: Date;
}

const NO_CLOSURE: CollectionProcedureInvoicesView = {
  state: "done",
  reason: "no_closure",
  missingOrderCount: 0,
  unconfirmedDeliveries: [],
  closure: null,
};

/**
 * **L'onglet « Factures » de la procédure** (Hugo, 2026-10-24) : la carte de
 * la clôture telle que « Prélèvement du mois » la lisait (`closureView`), les
 * bons sans facture et les bons à constater de LA période — par les lectures
 * de l'émission et des bons à constater, jamais une règle recopiée.
 *
 * - les bons sans facture : `uninvoicedOrders(plancher, clôture)`, restreints
 *   aux payeurs qui closent ici (`closesFor`) — exactement ce que « Émettre »
 *   prendrait (`IssueMonthlyInvoicesHandler.prepare`) ;
 * - les bons à constater : jour demandé dans la période affichée
 *   (`periodOf`, la plus longue), passé, payeur qui clôt ici.
 */
@Injectable()
export class ProcedureInvoicesStep {
  constructor(
    private readonly invoices: MonthlyInvoicesReader,
    private readonly batches: ClosureBatchesReader,
    private readonly uninvoiced: UninvoicedOrdersReader,
    private readonly unconfirmed: UnconfirmedDeliveriesReader,
  ) {}

  async read(query: ProcedureInvoicesQuery): Promise<CollectionProcedureInvoicesView> {
    const { legalEntityId, calendar, closesAt, now } = query;
    // Un lot clos hors du calendrier (un rythme changé depuis) n'a pas de
    // période de facture : rien à émettre pour cette clôture.
    if (closesAt === null || !calendar.isClosure(closesAt)) {
      return NO_CLOSURE;
    }
    const [read, batches] = await Promise.all([
      this.invoices.ofPeriod(legalEntityId, closesAt),
      this.batches.ofClosures(legalEntityId, [closesAt]),
    ]);
    const closure = closureView(calendar, closesAt, read, batches, now);
    const [missingOrderCount, unconfirmed] = await Promise.all([
      this.missingCount(calendar, closure, closesAt),
      this.unconfirmedOf(calendar, closesAt, now),
    ]);
    const status = invoicesStatus({
      reached: closure.reached,
      open: closure.open,
      missingOrderCount,
      unconfirmedCount: unconfirmed.length,
    });
    return { ...status, missingOrderCount, unconfirmedDeliveries: unconfirmed, closure };
  }

  /** Les bons que l'émission de cette clôture prendrait encore. */
  private async missingCount(
    calendar: InvoicingCalendar,
    closure: MonthlyClosureView,
    closesAt: Date,
  ): Promise<number> {
    if (closure.floorAt === null || !closure.open) {
      return 0;
    }
    const orders = await this.uninvoiced.uninvoicedOrders(new Date(closure.floorAt), closesAt);
    const follows = await this.uninvoiced.billingFollowsOf(unique(orders.map((o) => o.companyId)));
    return ordersByPayer(orders, follows)
      .filter((payer) => calendar.closesFor(payer.payerId, closesAt))
      .reduce((sum, payer) => sum + payer.orders.length, 0);
  }

  /** Les bons à constater de la période, du plus ancien au plus récent. */
  private async unconfirmedOf(
    calendar: InvoicingCalendar,
    closesAt: Date,
    now: Date,
  ): Promise<readonly UnconfirmedDeliveryView[]> {
    const period = calendar.periodOf(closesAt);
    const lastDay = lastDayOf(closesAt);
    const rows = await this.unconfirmed.servedBefore(
      instantToLocal(now).day,
      instantToLocal(period.startsAt).day,
    );
    const inPeriod = rows.filter((row) => row.serviceDay <= lastDay);
    const follows = await this.uninvoiced.billingFollowsOf(
      unique(inPeriod.map((row) => row.companyId)),
    );
    return inPeriod
      .filter((row) => closesHere(row, follows, calendar, closesAt))
      .map(unconfirmedDeliveryView);
  }
}

function closesHere(
  row: UnconfirmedDelivery,
  follows: readonly BillingFollow[],
  calendar: InvoicingCalendar,
  closesAt: Date,
): boolean {
  return calendar.closesFor(billedPayerOf(row, follows), closesAt);
}
