import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  UnpaidTransferInvoicesReader,
  type UnpaidTransferFilter,
  type UnpaidTransferInvoice,
} from "../../../domain/ports/unpaid-transfer-invoices.reader.js";
import { ListUnpaidTransferInvoicesHandler } from "../list-unpaid-transfer-invoices.handler.js";
import { ListUnpaidTransferInvoicesQuery } from "../list-unpaid-transfer-invoices.query.js";

/** Horloge FIXE : le 20 novembre 2026 à 10 h à Paris. */
const NOW = new Date("2026-11-20T09:00:00.000Z");

const unpaid = (over: Partial<UnpaidTransferInvoice> = {}): UnpaidTransferInvoice => ({
  invoiceId: "inv_1",
  number: "FA-LFD-2026-000001",
  legalEntityId: "le1",
  legalEntityName: "La Folie Douce",
  payerCompanyId: "cmp_port",
  payerName: "Boulangerie du Port",
  issuedOn: "2026-10-31",
  dueOn: "2026-11-14",
  remainingCents: 12_000,
  ...over,
});

class FixedUnpaid extends UnpaidTransferInvoicesReader {
  readonly filters: UnpaidTransferFilter[] = [];
  unpaid(filter: UnpaidTransferFilter): Promise<readonly UnpaidTransferInvoice[]> {
    this.filters.push(filter);
    return Promise.resolve([
      unpaid({ invoiceId: "inv_2", number: "FA-LFD-2026-000002", dueOn: "2026-11-20" }),
      unpaid(),
      unpaid({ invoiceId: "inv_3", number: "FA-LFD-2026-000003", remainingCents: 500 }),
    ]);
  }
}

describe("ListUnpaidTransferInvoicesHandler — les impayés au virement (V8, C7)", () => {
  it("chaque facture avec son retard, au jour de Paris ; le total ne compte que le retard", async () => {
    const reader = new FixedUnpaid();
    const handler = new ListUnpaidTransferInvoicesHandler(reader, new FixedClock(NOW));

    const view = await handler.execute(new ListUnpaidTransferInvoicesQuery("le1", null, false));

    expect(reader.filters).toEqual([{ legalEntityId: "le1", payerCompanyId: null }]);
    expect(view.invoices.map((one) => [one.number, one.overdue, one.daysLate])).toEqual([
      ["FA-LFD-2026-000001", true, 6],
      ["FA-LFD-2026-000003", true, 6],
      ["FA-LFD-2026-000002", false, 0],
    ]);
    expect(view.overdueCents).toBe(12_500);
    expect(view.invoices[0]).toMatchObject({
      amountCents: 12_000,
      payerName: "Boulangerie du Port",
    });
  });

  it("`overdueOnly` ne garde que celles dont l'échéance est passée", async () => {
    const handler = new ListUnpaidTransferInvoicesHandler(new FixedUnpaid(), new FixedClock(NOW));

    const view = await handler.execute(new ListUnpaidTransferInvoicesQuery(null, "cmp_port", true));

    expect(view.invoices.map((one) => one.number)).toEqual([
      "FA-LFD-2026-000001",
      "FA-LFD-2026-000003",
    ]);
  });
});
