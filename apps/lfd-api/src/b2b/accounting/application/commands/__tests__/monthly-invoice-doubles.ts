import {
  OrderDeliveryHistoryReader,
  type OrderDeliveryStopFact,
} from "../../../../../delivery/channels/commerce/index.js";
import {
  OrderHandoverHistoryReader,
  type OrderHandoverHistoryFact,
} from "../../../../../handover/channels/commerce/index.js";
import type { Invoice } from "../../../domain/entities/invoice.js";
import { BillingRhythmReader } from "../../../domain/ports/billing-rhythm.reader.js";
import { InvoiceIssuersReader } from "../../../domain/ports/invoice-issuers.reader.js";
import { InvoicingFloorReader } from "../../../domain/ports/invoicing-floor.reader.js";
import { InvoiceNumbering } from "../../../domain/ports/invoice-numbering.js";
import { InvoiceRepository } from "../../../domain/ports/invoice.repository.js";
import {
  MonthlyInvoiceOutcomes,
  type MonthlyInvoiceOutcomeKey,
} from "../../../domain/ports/monthly-invoice-outcomes.js";
import { MonthlyInvoicingReader } from "../../../domain/ports/monthly-invoicing.reader.js";
import type { BillingFollow } from "../../../domain/ports/statement-billing.reader.js";
import type { InvoiceSellerFacts } from "../../../domain/services/invoice-issuance-blockers.js";
import {
  invoiceGroupKey,
  type InvoiceableOrder,
} from "../../../domain/services/monthly-invoicing.js";
import { BillingRhythmSetting } from "../../../domain/value-objects/billing-rhythm-setting.js";
import type { CollectionFormName } from "../../../domain/value-objects/collection-form.js";
import { InvoiceNumber } from "../../../domain/value-objects/invoice-number.js";

/**
 * Doublés de la facture du mois (lot E4), chacun héritant de son port.
 * `uninvoicedOrders` rend les bons qu'aucune facture mémorisée ne porte :
 * un rejeu voit ce que le premier passage a écrit, comme la base.
 */

export class MemoryInvoices extends InvoiceRepository {
  readonly inserted: Invoice[] = [];
  insert(invoice: Invoice): Promise<void> {
    this.inserted.push(invoice);
    return Promise.resolve();
  }
  attachDocument(): Promise<void> {
    return Promise.resolve();
  }
}

export class CountingNumbering extends InvoiceNumbering {
  private rank = 0;
  next(_legalEntityId: string, issuedOn: string): Promise<InvoiceNumber> {
    this.rank += 1;
    return Promise.resolve(InvoiceNumber.compose(Number(issuedOn.slice(0, 4)), this.rank));
  }
}

export class FakeMonthlyReader extends MonthlyInvoicingReader {
  floorAt: Date | null = null;
  orders: InvoiceableOrder[] = [];
  follows: BillingFollow[] = [];
  forms = new Map<string, CollectionFormName>();
  readonly asked: { readonly from: Date; readonly to: Date }[] = [];

  constructor(
    private readonly invoices: MemoryInvoices,
    private readonly outcomes: MemoryOutcomes,
  ) {
    super();
  }

  invoicingFloor(): Promise<Date | null> {
    return Promise.resolve(this.floorAt);
  }
  uninvoicedOrders(from: Date, to: Date): Promise<readonly InvoiceableOrder[]> {
    this.asked.push({ from, to });
    const taken = new Set(
      this.invoices.inserted.flatMap((invoice) =>
        invoice.toState().orders.map((order) => order.orderId),
      ),
    );
    return Promise.resolve(this.orders.filter((order) => !taken.has(order.orderId)));
  }
  billingFollowsOf(): Promise<readonly BillingFollow[]> {
    return Promise.resolve(this.follows);
  }
  collectionFormsAt(): Promise<ReadonlyMap<string, CollectionFormName>> {
    return Promise.resolve(this.forms);
  }
  companyNames(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return Promise.resolve(new Map(ids.map((id) => [id, `Société ${id}`])));
  }
  invoicedGroups(legalEntityId: string, periodClosesAt: Date): Promise<ReadonlySet<string>> {
    return Promise.resolve(
      new Set(
        [...this.outcomes.rows.values()]
          .filter(
            (row) =>
              row.key.legalEntityId === legalEntityId &&
              row.key.periodClosesAt.getTime() === periodClosesAt.getTime() &&
              row.invoiceId !== null,
          )
          .map((row) => invoiceGroupKey(row.key.payerCompanyId, row.key.mandateId)),
      ),
    );
  }
}

export interface OutcomeRow {
  readonly key: MonthlyInvoiceOutcomeKey;
  readonly invoiceId: string | null;
  readonly message: string | null;
}

export class MemoryOutcomes extends MonthlyInvoiceOutcomes {
  readonly rows = new Map<string, OutcomeRow>();
  recordIssued(key: MonthlyInvoiceOutcomeKey, invoiceId: string): Promise<void> {
    this.rows.set(invoiceGroupKey(key.payerCompanyId, key.mandateId), {
      key,
      invoiceId,
      message: null,
    });
    return Promise.resolve();
  }
  recordBlocked(key: MonthlyInvoiceOutcomeKey, message: string): Promise<void> {
    this.rows.set(invoiceGroupKey(key.payerCompanyId, key.mandateId), {
      key,
      invoiceId: null,
      message,
    });
    return Promise.resolve();
  }
}

export class FixedIssuers extends InvoiceIssuersReader {
  constructor(private readonly issuers: readonly InvoiceSellerFacts[]) {
    super();
  }
  activeIssuers(): Promise<readonly InvoiceSellerFacts[]> {
    return Promise.resolve(this.issuers);
  }
}

export class NoHandovers extends OrderHandoverHistoryReader {
  facts = new Map<string, OrderHandoverHistoryFact>();
  ofOrders(): Promise<ReadonlyMap<string, OrderHandoverHistoryFact>> {
    return Promise.resolve(this.facts);
  }
}

export class NoStops extends OrderDeliveryHistoryReader {
  ofOrders(): Promise<readonly OrderDeliveryStopFact[]> {
    return Promise.resolve([]);
  }
}

/** Le même réglage pour toute entité connue ; mensuel au 1er par défaut. */
export class FixedRhythms extends BillingRhythmReader {
  constructor(
    private readonly setting: BillingRhythmSetting | null = BillingRhythmSetting.initial(),
  ) {
    super();
  }
  settingOf(): Promise<BillingRhythmSetting | null> {
    return Promise.resolve(this.setting);
  }
}

export class FixedFloor extends InvoicingFloorReader {
  constructor(private readonly at: Date | null) {
    super();
  }
  floor(): Promise<Date | null> {
    return Promise.resolve(this.at);
  }
}
