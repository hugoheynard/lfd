import type {
  CollectionProcedureInvoicesView,
  MonthlyClosureView,
  ProcedureOrderView,
} from "@lfd/contracts";
import { instantToLocal } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { ClosureBatchesReader } from "../../domain/ports/closure-batches.reader.js";
import { BillingFollowsReader } from "../../domain/ports/monthly-invoicing.reader.js";
import { MonthlyInvoicesReader } from "../../domain/ports/monthly-invoices.reader.js";
import {
  ProcedureOrdersReader,
  type ProcedureOrderRow,
} from "../../domain/ports/procedure-orders.reader.js";
import { billedPayerOf } from "../../domain/services/billed-payer.js";
import {
  deliveryDayMissing,
  invoicesStatus,
  procedureOrderStatus,
} from "../../domain/services/collection-procedure-invoices.js";
import type { InvoicingCalendar } from "../../domain/services/invoicing-calendar.js";
import { lastDayOf } from "../../domain/services/invoicing-closures.js";
import { closureView } from "../monthly-closures-support.js";
import { unique } from "../unique-ids.js";
import { procedureOrdersView } from "./procedure-orders-view.js";

/** Ce que l'onglet lit d'une procédure. */
export interface ProcedureInvoicesQuery {
  readonly legalEntityId: string;
  readonly calendar: InvoicingCalendar;
  /** La clôture de la procédure ; `null` : aucune à montrer. */
  readonly closesAt: Date | null;
  readonly now: Date;
}

const NO_ORDERS = {
  orders: [],
  figures: { invoiced: 0, receiptConfirmed: 0, receiptToConfirm: 0 },
  issuableCount: 0,
} as const;

const NO_CLOSURE: CollectionProcedureInvoicesView = {
  state: "done",
  reason: "no_closure",
  ...NO_ORDERS,
  closure: null,
};

/**
 * **L'onglet « Factures » de la procédure** (Hugo, 2026-10-24 ; plan § 12.4) :
 * la carte de la clôture (`closureView`) et UNE liste des commandes de LA
 * période, chacune avec UN statut (`procedureOrderStatus`).
 *
 * Une commande est de la période (`ProcedureOrdersReader`) si une facture de
 * la clôture la porte, si elle est dans l'assiette de l'émission
 * (`[plancher, clôture[`), ou si, sans jour de réception, son jour demandé
 * tombe dans la période affichée (`periodOf`, la plus longue) et est passé.
 * Hors des factures de la clôture, seuls restent les payeurs qui closent ici
 * (`closesFor`) — exactement ce que « Émettre » prendrait
 * (`IssueMonthlyInvoicesHandler.prepare`) — et une commande facturée ailleurs
 * n'est gardée que par sa date demandée (une facture d'avant la règle du
 * 2026-10-22, sans jour de réception).
 */
@Injectable()
export class ProcedureInvoicesStep {
  constructor(
    private readonly invoices: MonthlyInvoicesReader,
    private readonly batches: ClosureBatchesReader,
    private readonly follows: BillingFollowsReader,
    private readonly orders: ProcedureOrdersReader,
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
    const orders = await this.ordersOf(calendar, closure, closesAt, now);
    const status = invoicesStatus({
      reached: closure.reached,
      open: closure.open,
      statuses: orders.map((order) => order.status),
    });
    return { ...status, ...procedureOrdersView(orders), closure };
  }

  /** Les commandes de la période, par jour demandé puis par numéro ; aucune avant la mise en service. */
  private async ordersOf(
    calendar: InvoicingCalendar,
    closure: MonthlyClosureView,
    closesAt: Date,
    now: Date,
  ): Promise<readonly ProcedureOrderView[]> {
    if (closure.floorAt === null || !closure.open) {
      return [];
    }
    const periodInvoiceIds = new Set(closure.invoices.map((invoice) => invoice.invoiceId));
    const rows = await this.orders.ofPeriod({
      periodInvoiceIds: [...periodInvoiceIds],
      deliveredFrom: new Date(closure.floorAt),
      deliveredTo: closesAt,
      servedFrom: instantToLocal(calendar.periodOf(closesAt).startsAt).day,
      servedThrough: lastDayOf(closesAt),
      servedBefore: instantToLocal(now).day,
    });
    const follows = await this.follows.billingFollowsOf(unique(rows.map((row) => row.companyId)));
    return rows
      .filter((row) => {
        if (row.invoice !== null && periodInvoiceIds.has(row.invoice.invoiceId)) {
          return true;
        }
        // Facturée ailleurs : seule la branche « sans jour de réception » la retient.
        const kept = row.invoice === null || row.receivedOn === null;
        return kept && calendar.closesFor(billedPayerOf(row, follows), closesAt);
      })
      .map(orderView)
      .sort(byServiceDay);
  }
}

function orderView(row: ProcedureOrderRow): ProcedureOrderView {
  const facts = {
    invoiced: row.invoice !== null,
    handedOver: row.handedOver,
    receivedOn: row.receivedOn,
  };
  return {
    orderId: row.orderId,
    orderNumber: row.orderNumber,
    companyName: row.companyName,
    serviceDay: row.serviceDay ?? row.receivedOn,
    fulfillmentMethod: row.fulfillmentMethod,
    totalCents: row.totalCents,
    status: procedureOrderStatus(facts),
    invoiceNumber: row.invoice?.number ?? null,
    deliveryDayMissing: deliveryDayMissing(facts),
  };
}

function byServiceDay(a: ProcedureOrderView, b: ProcedureOrderView): number {
  const left = a.serviceDay ?? "";
  const right = b.serviceDay ?? "";
  return left === right ? a.orderNumber.localeCompare(b.orderNumber) : left.localeCompare(right);
}
