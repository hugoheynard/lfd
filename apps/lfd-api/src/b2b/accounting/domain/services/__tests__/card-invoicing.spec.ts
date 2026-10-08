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
    orderNumber: "CMD-001",
    companyId: "c_port",
    billedCompanyId: null,
    placedAt: PLACED,
    clientele: "pro",
    cancelled: false,
    paymentStatus: "paid",
    totalCents: 1_000,
    paidAt: PLACED,
    handedOverAt: PLACED,
    invoiced: false,
    refundedCents: 0,
    follows: [],
    frozen: frozenOrder("CMD-001", PLACED),
    ...overrides,
  };
}

describe("cardInvoiceVerdict", () => {
  it("une commande pro, payée par carte et retirée, se facture", () => {
    expect(cardInvoiceVerdict(candidate())).toBe("issuable");
  });

  it("attend l'autre déclencheur, dans les deux ordres", () => {
    expect(cardInvoiceVerdict(candidate({ handedOverAt: null }))).toBe("awaiting_handover");
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

describe("cardInvoiceDueOn", () => {
  it("le jour du paiement, jamais avant l'émission", () => {
    expect(cardInvoiceDueOn("2026-09-28", "2026-09-30")).toBe("2026-09-30");
    expect(cardInvoiceDueOn("2026-09-30", "2026-09-30")).toBe("2026-09-30");
  });
});
