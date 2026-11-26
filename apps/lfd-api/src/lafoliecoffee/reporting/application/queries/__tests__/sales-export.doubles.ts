import {
  CompanySalesIdentityReader,
  type CompanySalesIdentity,
} from "../../../../account/domain/ports/company-sales-identity.reader.js";
import {
  IssuedCreditNotesReader,
  type IssuedCreditNote,
} from "../../../../accounting/domain/ports/issued-credit-notes.reader.js";
import {
  CategoryNamesReader,
  type CategoryName,
} from "../../../../catalog/domain/ports/category-names.reader.js";
import {
  SalesExportReader,
  type SalesExportLine,
  type SalesExportOrder,
} from "../../../../orders/domain/ports/sales-export.reader.js";
import {
  SucceededCardRefundsReader,
  type SubjectSucceededRefund,
} from "../../../../../payment/channels/requests/index.js";

/** Les commandes servies telles quelles ; chaque appel est noté. */
export class StubSalesExportReader extends SalesExportReader {
  readonly calls: (readonly [string, string])[] = [];
  constructor(private readonly orders: readonly SalesExportOrder[]) {
    super();
  }
  placedBetween(fromDay: string, toDay: string): Promise<readonly SalesExportOrder[]> {
    this.calls.push([fromDay, toDay]);
    return Promise.resolve(this.orders);
  }
}

export class StubIssuedCreditNotesReader extends IssuedCreditNotesReader {
  readonly calls: (readonly [string, string])[] = [];
  constructor(private readonly notes: readonly IssuedCreditNote[]) {
    super();
  }
  issuedBetween(fromDay: string, toDay: string): Promise<readonly IssuedCreditNote[]> {
    this.calls.push([fromDay, toDay]);
    return Promise.resolve(this.notes);
  }
}

/** Ne rend que les familles demandées, comme la vraie lecture. */
export class StubCategoryNamesReader extends CategoryNamesReader {
  readonly calls: (readonly string[])[] = [];
  constructor(private readonly names: readonly CategoryName[]) {
    super();
  }
  namesOf(ids: readonly string[]): Promise<readonly CategoryName[]> {
    this.calls.push(ids);
    return Promise.resolve(this.names.filter((name) => ids.includes(name.id)));
  }
}

/** Ne rend que les sociétés demandées, comme la vraie lecture. */
export class StubCompanySalesIdentityReader extends CompanySalesIdentityReader {
  readonly calls: (readonly string[])[] = [];
  constructor(private readonly identities: readonly CompanySalesIdentity[]) {
    super();
  }
  identitiesOf(companyIds: readonly string[]): Promise<readonly CompanySalesIdentity[]> {
    this.calls.push(companyIds);
    return Promise.resolve(this.identities.filter((one) => companyIds.includes(one.companyId)));
  }
}

/** Ne rend que les remboursements des sujets demandés. */
export class StubSucceededCardRefundsReader extends SucceededCardRefundsReader {
  readonly calls: (readonly [string, readonly string[]])[] = [];
  constructor(private readonly refunds: readonly SubjectSucceededRefund[]) {
    super();
  }
  succeededOf(
    subjectType: string,
    subjectIds: readonly string[],
  ): Promise<readonly SubjectSucceededRefund[]> {
    this.calls.push([subjectType, subjectIds]);
    return Promise.resolve(this.refunds.filter((one) => subjectIds.includes(one.subjectId)));
  }
}

export function aLine(overrides: Partial<SalesExportLine> = {}): SalesExportLine {
  return {
    sku: "VIE-001-1",
    productName: "Viennoise",
    categoryId: "cat-viennoiserie",
    quantity: 10,
    saleUnit: "piece",
    unitPriceMillicents: 100_000,
    lineTotalCents: 1000,
    vatRate: 5.5,
    lineTotalTtcCents: null,
    discountIds: [],
    ...overrides,
  };
}

/** Une commande pro au compte, soldée de rien, qui compte dans le CA. */
export function anOrder(overrides: Partial<SalesExportOrder> = {}): SalesExportOrder {
  return {
    orderId: "o1",
    orderNumber: "C-0001",
    placedAt: new Date("2026-03-10T08:41:37.000Z"),
    receivedOn: "2026-03-11",
    status: "fulfilled",
    cancelledAt: null,
    countsAsRevenue: true,
    paymentStatus: "not_required",
    settlementVenue: null,
    offered: false,
    offerNature: null,
    offeredTotalCents: null,
    clientele: "pro",
    buyerKind: "registered",
    companyId: "co1",
    fulfillment: "pickup",
    vatMethod: "line_ht",
    amounts: {
      subtotalCents: 1000,
      discountCents: 0,
      voucherDiscountCents: 0,
      deliveryFeeCents: 0,
      lateFeeCents: 0,
      vatCents: 55,
      vatShares: [{ rate: 5.5, amountCents: 55 }],
      totalCents: 1055,
    },
    ttcByRate: null,
    settlement: null,
    lines: [aLine()],
    ...overrides,
  };
}
