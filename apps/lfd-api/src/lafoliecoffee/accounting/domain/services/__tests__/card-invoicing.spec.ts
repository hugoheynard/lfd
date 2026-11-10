import {
  cardInvoiceDueOn,
  cardInvoiceVerdict,
  type CardInvoiceCandidate,
} from "../card-invoicing.js";
import { frozenOrder } from "./collection-fixtures.js";

/**
 * Le verdict de la facture carte (lot E5a, § 2 bis-1 et -9, A10). Les
 * instants ne sont comparés qu'à leur absence, jamais à l'horloge.
 */

const PLACED = new Date("2026-09-15T08:00:00.000Z");

function candidate(overrides: Partial<CardInvoiceCandidate> = {}): CardInvoiceCandidate {
  return {
    orderId: "o_1",
    orderNumber: "ORD-001",
    companyId: "c_port",
    billedCompanyId: null,
    placedAt: PLACED,
    clientele: "pro",
    cancelled: false,
    paymentStatus: "paid",
    totalCents: 1_000,
    paidAt: PLACED,
    handedOverAt: PLACED,
    receivedOn: "2026-09-15",
    invoiced: false,
    chargedCents: 1_000,
    refundedCents: 0,
    adjustmentRefundedCents: 0,
    adjustmentPending: false,
    adjustmentStopped: false,
    follows: [],
    frozen: frozenOrder("ORD-001", PLACED),
    deliveryNoteNumbers: ["BL-001-1"],
    ...overrides,
  };
}

describe("cardInvoiceVerdict", () => {
  it("une commande pro, payée par carte et retirée, se facture", () => {
    expect(cardInvoiceVerdict(candidate())).toBe("issuable");
  });

  it("attend l'autre déclencheur, dans les deux ordres", () => {
    expect(cardInvoiceVerdict(candidate({ handedOverAt: null, receivedOn: null }))).toBe(
      "awaiting_handover",
    );
    expect(cardInvoiceVerdict(candidate({ paymentStatus: "pending", paidAt: null }))).toBe(
      "awaiting_payment",
    );
  });

  it("une 380 qui couvre déjà le bon : rien de plus", () => {
    expect(cardInvoiceVerdict(candidate({ invoiced: true }))).toBe("already_invoiced");
  });

  it.each<[string, Partial<CardInvoiceCandidate>]>([
    ["publique", { clientele: "public" }],
    ["sans société, clientèle inconnue", { companyId: null, clientele: null }],
    ["au compte", { paymentStatus: "not_required", paidAt: null }],
    ["gratuite", { totalCents: 0 }],
    ["annulée", { cancelled: true }],
  ])("jamais une commande %s", (_label, overrides) => {
    expect(cardInvoiceVerdict(candidate(overrides))).toBe("not_card");
  });

  it("clientèle inconnue AVEC société : pro (§ 2 bis-9)", () => {
    expect(cardInvoiceVerdict(candidate({ clientele: null }))).toBe("issuable");
  });

  it("remboursée en totalité avant d'être facturée : pas de vente (A10)", () => {
    expect(cardInvoiceVerdict(candidate({ paymentStatus: "refunded", refundedCents: 1_000 }))).toBe(
      "fully_refunded",
    );
    expect(cardInvoiceVerdict(candidate({ refundedCents: 400 }))).toBe("issuable");
  });
});

/** Plan M2, §6.1 (lot P1.c) : l'égalité G3 avant le retrait — `blocked`. */
describe("cardInvoiceVerdict — l'argent qui ne tombe pas juste (G3)", () => {
  it.each<[string, Partial<CardInvoiceCandidate>]>([
    ["un ajustement attend son issue", { adjustmentPending: true }],
    ["un ajustement est arrêté", { adjustmentStopped: true }],
    ["l'encaissé diffère du total", { chargedCents: 1_200 }],
    ["l'ajustement rendu ne tombe pas sur le total baissé", { adjustmentRefundedCents: 100 }],
  ])("%s : `blocked`", (_label, overrides) => {
    expect(cardInvoiceVerdict(candidate(overrides))).toBe("blocked");
  });

  it("encaissé − ajustement = total dû : la facture part, sur le total baissé", () => {
    expect(
      cardInvoiceVerdict(
        candidate({ totalCents: 700, chargedCents: 1_000, adjustmentRefundedCents: 300 }),
      ),
    ).toBe("issuable");
  });

  it("`blocked` passe AVANT `awaiting_handover`, et APRÈS `awaiting_payment`", () => {
    expect(cardInvoiceVerdict(candidate({ adjustmentStopped: true, handedOverAt: null }))).toBe(
      "blocked",
    );
    expect(
      cardInvoiceVerdict(
        candidate({ adjustmentStopped: true, paymentStatus: "pending", paidAt: null }),
      ),
    ).toBe("awaiting_payment");
  });

  it("un remboursement `return` n'entre pas dans l'égalité : `fully_refunded` le lit", () => {
    expect(cardInvoiceVerdict(candidate({ paymentStatus: "refunded", refundedCents: 1_000 }))).toBe(
      "fully_refunded",
    );
  });
});

describe("cardInvoiceDueOn", () => {
  it("le jour du paiement, jamais avant l'émission", () => {
    expect(cardInvoiceDueOn("2026-09-28", "2026-09-30")).toBe("2026-09-30");
    expect(cardInvoiceDueOn("2026-09-30", "2026-09-30")).toBe("2026-09-30");
  });
});
