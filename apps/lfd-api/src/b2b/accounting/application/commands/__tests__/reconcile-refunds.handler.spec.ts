import { Invoice } from "../../../domain/entities/invoice.js";
import { issueInput } from "../../../domain/entities/__tests__/invoice-fixtures.js";
import { RefundNotCreditedEvent } from "../../../domain/events/refund-not-credited.event.js";
import { ReconcileRefundsCommand } from "../reconcile-refunds.command.js";
import { cardWorld } from "./card-invoice-doubles.js";

/**
 * Le rapprochement des remboursements (lot E5b) hors facture carte : une
 * commande sans facture, et une commande sur une facture du mois. Les dates
 * ne sont comparées qu'entre elles.
 */

const AT = new Date("2026-10-02T10:00:00.000Z");

describe("ReconcileRefundsHandler", () => {
  it("sans facture, ne fait rien : la facture carte rattrapera", async () => {
    const w = cardWorld(AT);
    w.refunds.add("o_1", "r_1", 300);

    expect(await w.reconcile.execute(new ReconcileRefundsCommand("o_1"))).toBe(0);
    expect(w.invoices.inserted).toEqual([]);
    expect(w.journal.facts).toEqual([]);
    expect(w.lock.locked).toEqual(["o_1"]);
  });

  it("sur une facture du mois : aucun avoir, le journal et la cloche le disent", async () => {
    const w = cardWorld(AT);
    const monthly = Invoice.issue(issueInput());
    await w.invoices.insert(monthly);
    w.refunds.add("o_1", "r_1", 300);

    expect(await w.reconcile.execute(new ReconcileRefundsCommand("o_1"))).toBe(0);

    expect(w.invoices.inserted).toEqual([monthly]);
    expect(w.journal.facts).toEqual([
      {
        type: "order.refund_not_credited",
        subjectType: "order",
        subjectId: "o_1",
        payload: {
          subjectLabel: "CMD-001",
          amountCents: 300,
          invoice: { id: monthly.id, name: monthly.number },
          reason: "account_invoice",
        },
      },
    ]);
    expect(w.events.published).toEqual([
      new RefundNotCreditedEvent("o_1", "CMD-001", "r_1", 300, monthly.number, "account_invoice"),
    ]);
    expect(w.refunds.rows[0]?.creditNoteId).toBeNull();
  });
});
