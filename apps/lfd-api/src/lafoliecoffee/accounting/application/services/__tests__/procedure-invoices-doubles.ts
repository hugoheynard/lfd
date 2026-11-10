import type { MonthlyInvoiceView } from "@lfd/contracts";

import {
  ClosureBatchesReader,
  type ClosureBatchRead,
} from "../../../domain/ports/closure-batches.reader.js";
import {
  MonthlyInvoicesReader,
  type MonthlyInvoicesRead,
} from "../../../domain/ports/monthly-invoices.reader.js";
import { BillingFollowsReader } from "../../../domain/ports/monthly-invoicing.reader.js";
import {
  ProcedureOrdersReader,
  type ProcedureOrderRow,
  type ProcedureOrdersScope,
} from "../../../domain/ports/procedure-orders.reader.js";
import type { BillingFollow } from "../../../domain/ports/statement-billing.reader.js";
import { ProcedureInvoicesStep } from "../procedure-invoices-step.js";

/**
 * Doublés de l'onglet « Factures » de la procédure, chacun héritant de son
 * port — partagés par la suite du service et par le monde de la lecture.
 */
export class FixedPeriodInvoices extends MonthlyInvoicesReader {
  floorAt: Date | null = null;
  invoices: MonthlyInvoiceView[] = [];
  ofPeriod(): Promise<MonthlyInvoicesRead> {
    return Promise.resolve({
      floorAt: this.floorAt,
      invoices: this.invoices,
      signaled: [],
      autopilotRun: null,
    });
  }
}

export class NoClosureBatches extends ClosureBatchesReader {
  ofClosures(): Promise<readonly ClosureBatchRead[]> {
    return Promise.resolve([]);
  }
}

export class FixedFollows extends BillingFollowsReader {
  follows: BillingFollow[] = [];
  billingFollowsOf(): Promise<readonly BillingFollow[]> {
    return Promise.resolve(this.follows);
  }
}

/** Rend ses lignes telles quelles : les trois branches sont le travail de l'adaptateur. */
export class FixedProcedureOrders extends ProcedureOrdersReader {
  rows: ProcedureOrderRow[] = [];
  readonly asked: ProcedureOrdersScope[] = [];
  ofPeriod(scope: ProcedureOrdersScope): Promise<readonly ProcedureOrderRow[]> {
    this.asked.push(scope);
    return Promise.resolve(this.rows);
  }
}

/** Une commande de la période ; par défaut remise, livrée le 12 octobre, sans facture. */
export function procedureRow(
  orderId: string,
  overrides: Partial<ProcedureOrderRow> = {},
): ProcedureOrderRow {
  return {
    orderId,
    orderNumber: `ORD-${orderId}`,
    companyId: "c1",
    companyName: "Hôtel du Port",
    serviceDay: "2026-10-12",
    fulfillmentMethod: "delivery",
    totalCents: 1200,
    placedAt: new Date("2026-10-10T07:00:00.000Z"),
    billedCompanyId: null,
    handedOver: true,
    receivedOn: "2026-10-12",
    partiallyHandedOver: false,
    remainderPlannedOn: null,
    invoice: null,
    ...overrides,
  };
}

export function invoicesStepWorld() {
  const invoices = new FixedPeriodInvoices();
  const follows = new FixedFollows();
  const orders = new FixedProcedureOrders();
  const step = new ProcedureInvoicesStep(invoices, new NoClosureBatches(), follows, orders);
  return { invoices, follows, orders, step };
}
