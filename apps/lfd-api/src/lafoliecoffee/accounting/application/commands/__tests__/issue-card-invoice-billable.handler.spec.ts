import { SELLER_FACTS } from "../../../domain/entities/__tests__/invoice-fixtures.js";
import { UnsettledCardInvoicePreparationError } from "../../../domain/errors/card-invoice-errors.js";
import {
  CARD_INVOICE_AWAITS_SETTLEMENT,
  type CardInvoiceCandidate,
} from "../../../domain/services/card-invoicing.js";
import { CREDITOR, frozenOrder } from "../../../domain/services/__tests__/collection-fixtures.js";
import type { FrozenInvoiceOrder } from "../../../domain/services/invoice-dossier.types.js";
import { prepareCardInvoice } from "../../card-invoice-support.js";
import { IssueCardInvoiceCommand } from "../issue-card-invoice.command.js";
import { cardWorld } from "./card-invoice-doubles.js";
import { FixedBuyers, FixedCreditors } from "./collection-doubles.js";
import { FixedIssuers } from "./monthly-invoice-doubles.js";

/**
 * **La facture carte porte le livré** (plan E9, lot F, § 3.2 et § 3.3) :
 * elle attend le solde, et son TTC comme son acompte sont le facturable. Les
 * instants ne sont comparés qu'à l'horloge FIXE du monde.
 */

const RETRAIT = new Date("2026-09-30T12:00:00.000Z");
const PAID = new Date("2026-09-29T09:00:00.000Z");

/** Le livré : 569 c HT à 5,5 % → 31 c de TVA, 600 c TTC. */
function delivered(): FrozenInvoiceOrder {
  const ordered = frozenOrder("ORD-001", PAID);
  return {
    ...ordered,
    lines: ordered.lines.map((line) => ({
      ...line,
      unitPriceMillicents: 569_000,
      lineTotalCents: 569,
    })),
    vatShares: [{ rate: 5.5, amountCents: 31 }],
    vatCents: 31,
    totalCents: 600,
  };
}

function order(overrides: Partial<CardInvoiceCandidate> = {}): CardInvoiceCandidate {
  return {
    orderId: "o_1",
    orderNumber: "ORD-001",
    companyId: "c_port",
    billedCompanyId: null,
    placedAt: PAID,
    clientele: "pro",
    cancelled: false,
    paymentStatus: "paid",
    totalCents: 1_000,
    billableCents: 1_000,
    paidAt: PAID,
    handedOverAt: RETRAIT,
    receivedOn: "2026-09-30",
    invoiced: false,
    chargedCents: 1_000,
    refundedCents: 0,
    adjustmentRefundedCents: 0,
    adjustmentPending: false,
    adjustmentStopped: false,
    follows: [],
    frozen: frozenOrder("ORD-001", PAID),
    deliveryNoteNumbers: ["BL-001-1"],
    ...overrides,
  };
}

const issue = (w: ReturnType<typeof cardWorld>) =>
  w.handler.execute(new IssueCardInvoiceCommand("o_1"));

describe("IssueCardInvoiceHandler — au facturable du solde (lot F)", () => {
  it("retirée sans solde : attend, avec sa phrase, sans rien ranger ni émettre", async () => {
    const w = cardWorld(RETRAIT);
    w.reader.orders.set("o_1", order({ billableCents: null }));

    expect(await issue(w)).toEqual({
      outcome: "awaiting_settlement",
      number: null,
      message: CARD_INVOICE_AWAITS_SETTLEMENT,
    });
    expect(w.invoices.inserted).toEqual([]);
    expect(w.outcomes.rows.size).toBe(0);
  });

  it("puis le solde posé : la facture part, sans « Réessayer »", async () => {
    const w = cardWorld(RETRAIT);
    w.reader.orders.set("o_1", order({ billableCents: null }));
    await issue(w);
    w.reader.orders.set("o_1", order());

    expect((await issue(w)).outcome).toBe("issued");
  });

  it("encaissé 1000, ajustement 400, livré 600 : TTC et acompte de 600, les lignes du livré", async () => {
    const w = cardWorld(RETRAIT);
    w.reader.orders.set(
      "o_1",
      order({
        billableCents: 600,
        adjustmentRefundedCents: 400,
        refundedCents: 400,
        frozen: delivered(),
      }),
    );

    expect((await issue(w)).outcome).toBe("issued");
    const invoice = w.invoices.inserted[0];
    expect(invoice?.toState().vat.totalCents).toBe(600);
    expect(invoice?.toState().prepayment).toMatchObject({ amountCents: 600 });
    expect(invoice?.toState().lines).toHaveLength(1);
  });

  it("un livré dont le TTC diffère du facturable est signalé, pas émis", async () => {
    const w = cardWorld(RETRAIT);
    w.reader.orders.set(
      "o_1",
      order({ billableCents: 600, adjustmentRefundedCents: 400, refundedCents: 400 }),
    );

    const outcome = await issue(w);
    expect(outcome.outcome).toBe("blocked");
    expect(outcome.message).toMatch(/diffère du facturable \(600 c\)/);
    expect(w.invoices.inserted).toEqual([]);
  });
});

describe("prepareCardInvoice — sans solde", () => {
  it("lève un défaut de code, jamais rangé en `blocked`", async () => {
    const readers = {
      creditors: new FixedCreditors(CREDITOR),
      issuers: new FixedIssuers([SELLER_FACTS]),
      buyers: new FixedBuyers(),
    };

    await expect(
      prepareCardInvoice(readers, order({ billableCents: null }), "inv_1", RETRAIT),
    ).rejects.toBeInstanceOf(UnsettledCardInvoicePreparationError);
  });
});
