import { ORDER_SUMMARY_MAX_ORDERS } from "@lfd/contracts";

import { OrderCompanyNotFoundError } from "../../../domain/errors/order-errors.js";
import {
  OrderSummaryOrdersNotFoundError,
  OrderSummaryTooManyOrdersError,
} from "../../../domain/errors/order-summary-errors.js";
import {
  CompanyOrderSummaryReader,
  type CompanyOrderSummaryScope,
} from "../../../domain/ports/company-order-summary.reader.js";
import {
  OrderGuardReader,
  type AccountSettlementStanding,
  type OrderCompanyStatus,
  type OrderRole,
} from "../../../domain/ports/order-guard.reader.js";
import type { OrderSummarySource } from "../../../domain/services/order-summary.js";
import { SummarizeCompanyOrdersHandler } from "../summarize-company-orders.handler.js";
import { SummarizeCompanyOrdersQuery } from "../summarize-company-orders.query.js";

/** Le rôle PROPRE dans la société listée — seul ce que le handler lit. */
class OwnRole extends OrderGuardReader {
  constructor(private readonly role: OrderRole | null) {
    super();
  }

  roleOf(): Promise<OrderRole | null> {
    return Promise.resolve(this.role);
  }

  companyStatusOf(): Promise<OrderCompanyStatus | null> {
    return Promise.reject(new Error("non utilisé"));
  }

  settlesOnAccount(): Promise<AccountSettlementStanding> {
    return Promise.reject(new Error("non utilisé"));
  }
}

/** Rend, sous le « mur », les seules commandes qu'il connaît. */
class RecordingSummary extends CompanyOrderSummaryReader {
  readonly scopes: CompanyOrderSummaryScope[] = [];

  constructor(private readonly visible: readonly OrderSummarySource[]) {
    super();
  }

  ordersFor(scope: CompanyOrderSummaryScope): Promise<readonly OrderSummarySource[]> {
    this.scopes.push(scope);
    return Promise.resolve(this.visible.filter((o) => scope.orderIds.includes(o.id)));
  }
}

const source = (id: string): OrderSummarySource => ({
  id,
  orderNumber: `CMD-${id}`,
  companyId: "co_principal",
  companyName: "Maison mère",
  cancelled: false,
  paymentStatus: "not_required",
  subtotalCents: 1_000,
  discountCents: 0,
  voucherDiscountCents: 0,
  deliveryFeeCents: 0,
  lateFeeCents: 0,
  vatCents: 55,
  vatShares: [{ rate: 5.5, amountCents: 55 }],
  totalCents: 1_055,
  lines: [{ sku: "VIE-001", name: "Croissant", quantity: 1, lineTotalCents: 1_000 }],
});

const query = (ids: readonly string[]) =>
  new SummarizeCompanyOrdersQuery("usr_1", "co_principal", ids);

describe("SummarizeCompanyOrdersHandler (plan récapitulatif, lot R1)", () => {
  it("UNE lecture, sans doublon, sous le mur du demandeur — puis l'agrégation", async () => {
    const reader = new RecordingSummary([source("o1"), source("o2")]);
    const handler = new SummarizeCompanyOrdersHandler(new OwnRole("owner"), reader);

    const summary = await handler.execute(query(["o1", "o2", "o1"]));

    expect(reader.scopes).toEqual([
      { actorUserId: "usr_1", companyId: "co_principal", orderIds: ["o1", "o2"] },
    ]);
    expect(summary.total.bottom.totalCents).toBe(2_110);
  });

  it("un id hors du mur : refus qui le nomme, jamais un récapitulatif partiel", async () => {
    const handler = new SummarizeCompanyOrdersHandler(
      new OwnRole("owner"),
      new RecordingSummary([source("o1")]),
    );

    await expect(handler.execute(query(["o1", "o_frere"]))).rejects.toEqual(
      new OrderSummaryOrdersNotFoundError(["o_frere"]),
    );
  });

  it("sans rattachement à la société : 404, et rien n'est lu", async () => {
    const reader = new RecordingSummary([source("o1")]);
    const handler = new SummarizeCompanyOrdersHandler(new OwnRole(null), reader);

    await expect(handler.execute(query(["o1"]))).rejects.toBeInstanceOf(OrderCompanyNotFoundError);
    expect(reader.scopes).toEqual([]);
  });

  it("au-delà du plafond : refus nommé, et rien n'est lu", async () => {
    const reader = new RecordingSummary([]);
    const handler = new SummarizeCompanyOrdersHandler(new OwnRole("owner"), reader);
    const ids = Array.from({ length: ORDER_SUMMARY_MAX_ORDERS + 1 }, (_, i) => `o${i}`);

    await expect(handler.execute(query(ids))).rejects.toBeInstanceOf(
      OrderSummaryTooManyOrdersError,
    );
    expect(reader.scopes).toEqual([]);
  });
});
