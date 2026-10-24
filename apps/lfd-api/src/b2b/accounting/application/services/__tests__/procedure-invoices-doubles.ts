import {
  ClosureBatchesReader,
  type ClosureBatchRead,
} from "../../../domain/ports/closure-batches.reader.js";
import {
  MonthlyInvoicesReader,
  type MonthlyInvoicesRead,
} from "../../../domain/ports/monthly-invoices.reader.js";
import { UninvoicedOrdersReader } from "../../../domain/ports/monthly-invoicing.reader.js";
import type { BillingFollow } from "../../../domain/ports/statement-billing.reader.js";
import {
  UnconfirmedDeliveriesReader,
  type UnconfirmedDelivery,
} from "../../../domain/ports/unconfirmed-deliveries.reader.js";
import type { InvoiceableOrder } from "../../../domain/services/monthly-invoicing.js";
import { ProcedureInvoicesStep } from "../procedure-invoices-step.js";

/**
 * Doublés de l'onglet « Factures » de la procédure, chacun héritant de son
 * port — partagés par la suite du service et par le monde de la lecture.
 */
export class FixedPeriodInvoices extends MonthlyInvoicesReader {
  floorAt: Date | null = null;
  ofPeriod(): Promise<MonthlyInvoicesRead> {
    return Promise.resolve({
      floorAt: this.floorAt,
      invoices: [],
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

export class FixedUninvoiced extends UninvoicedOrdersReader {
  orders: InvoiceableOrder[] = [];
  follows: BillingFollow[] = [];
  readonly asked: { readonly from: Date; readonly to: Date }[] = [];
  uninvoicedOrders(from: Date, to: Date): Promise<readonly InvoiceableOrder[]> {
    this.asked.push({ from, to });
    return Promise.resolve(this.orders);
  }
  billingFollowsOf(): Promise<readonly BillingFollow[]> {
    return Promise.resolve(this.follows);
  }
}

/** Rend les bons dont le jour tombe dans `[from, day[`, comme l'adaptateur. */
export class FixedUnconfirmed extends UnconfirmedDeliveriesReader {
  rows: UnconfirmedDelivery[] = [];
  readonly asked: { readonly day: string; readonly from: string | undefined }[] = [];
  servedBefore(day: string, from?: string): Promise<readonly UnconfirmedDelivery[]> {
    this.asked.push({ day, from });
    return Promise.resolve(
      this.rows.filter(
        (row) => row.serviceDay < day && (from === undefined || row.serviceDay >= from),
      ),
    );
  }
}

export function invoicesStepWorld() {
  const invoices = new FixedPeriodInvoices();
  const uninvoiced = new FixedUninvoiced();
  const unconfirmed = new FixedUnconfirmed();
  const step = new ProcedureInvoicesStep(invoices, new NoClosureBatches(), uninvoiced, unconfirmed);
  return { invoices, uninvoiced, unconfirmed, step };
}
