import type { BillingStatementView } from "@lfd/contracts";

import { BillingStatementNotFoundError } from "../../../domain/errors/billing-statement-errors.js";
import { BillingStatementReader } from "../../../domain/ports/billing-statement.reader.js";
import { GetBillingStatementQuery } from "../billing-statement-queries.js";
import { GetBillingStatementHandler } from "../get-billing-statement.handler.js";

class FixedStatements extends BillingStatementReader {
  readonly asked: string[] = [];

  constructor(private readonly view: BillingStatementView | null) {
    super();
  }

  byId(statementId: string): Promise<BillingStatementView | null> {
    this.asked.push(statementId);
    return Promise.resolve(this.view);
  }
}

const STATEMENT: BillingStatementView = {
  id: "st_1",
  batchId: "batch_1",
  lineRank: 1,
  status: "cancelled",
  batchStatus: "cancelled",
  seller: {
    name: "La Folie Douce",
    legalForm: "SAS",
    siren: "552100554",
    vatNumber: "FR89552100554",
    rcs: "Chambéry B 552 100 554",
    shareCapitalCents: 1_000_000,
    addressLines: ["12 rue du Fournil", "73000 Chambéry"],
    ics: "FR72ZZZ123456",
  },
  buyer: {
    companyId: "co_1",
    name: "Boulangerie du Port",
    legalForm: "SARL",
    siret: "",
    siren: "",
    vatNumber: "",
    billingAddressLines: [],
  },
  issuedOn: "2026-10-01",
  periodStartsOn: null,
  periodEndsOn: null,
  totalHtCents: 21,
  totalVatCents: 1,
  totalTtcCents: 22,
  ordersTotalCents: 24,
  invoice: {
    lines: [],
    companyDiscountCents: 0,
    voucherDiscountCents: 0,
    lateFeeCents: 0,
    deliveries: [],
    vat: {
      categories: [],
      goodsHtCents: 21,
      allowancesCents: 0,
      chargesCents: 0,
      taxableBaseCents: 21,
      vatCents: 1,
      totalCents: 22,
    },
    totalCents: 22,
  },
  bodyVersion: 1,
  computedWith: "invoice-dossier/2026-10-08",
  orders: [{ orderId: "o_1", orderNumber: "CMD-1" }],
};

describe("GetBillingStatementHandler", () => {
  it("rend l'arrêté tel que le port le relit, annulé compris — sans rien recalculer", async () => {
    const reader = new FixedStatements(STATEMENT);

    const view = await new GetBillingStatementHandler(reader).execute(
      new GetBillingStatementQuery("st_1"),
    );

    expect(view).toBe(STATEMENT);
    expect(reader.asked).toEqual(["st_1"]);
  });

  it("refuse un arrêté inconnu (404), en le nommant", async () => {
    const handler = new GetBillingStatementHandler(new FixedStatements(null));

    await expect(handler.execute(new GetBillingStatementQuery("st_absent"))).rejects.toThrow(
      BillingStatementNotFoundError,
    );
    await expect(handler.execute(new GetBillingStatementQuery("st_absent"))).rejects.toThrow(
      /st_absent/u,
    );
  });
});
