import {
  cardInvoiceDueOn,
  cardInvoiceVerdict,
  outsideCardInvoicing,
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
    billableCents: 1_000,
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
        candidate({
          totalCents: 700,
          billableCents: 700,
          chargedCents: 1_000,
          adjustmentRefundedCents: 300,
        }),
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

/** Plan E9, lot F, § 3.2 : la facture carte se juge au FACTURABLE du solde. */
describe("cardInvoiceVerdict — au facturable du solde (lot F)", () => {
  it("retirée, solde pas encore posé : `awaiting_settlement`", () => {
    expect(cardInvoiceVerdict(candidate({ billableCents: null }))).toBe("awaiting_settlement");
  });

  it("avant la remise, le verdict d'aujourd'hui, sans regarder le solde", () => {
    const before = { handedOverAt: null, receivedOn: null, billableCents: null };
    expect(cardInvoiceVerdict(candidate(before))).toBe("awaiting_handover");
    expect(cardInvoiceVerdict(candidate({ ...before, chargedCents: 1_200 }))).toBe("blocked");
  });

  it("encaissé 100, facturable 60, ajustement 40 : `issuable`", () => {
    const delivered = { billableCents: 60, chargedCents: 100, totalCents: 100 };
    expect(cardInvoiceVerdict(candidate({ ...delivered, adjustmentRefundedCents: 40 }))).toBe(
      "issuable",
    );
    expect(cardInvoiceVerdict(candidate(delivered))).toBe("blocked");
  });

  it("ajustement arrêté : `blocked` ; « Réglé autrement » (ligne manual comptée) : `issuable`", () => {
    const delivered = { billableCents: 60, chargedCents: 100, totalCents: 100 };
    expect(cardInvoiceVerdict(candidate({ ...delivered, adjustmentStopped: true }))).toBe(
      "blocked",
    );
    expect(
      cardInvoiceVerdict(
        candidate({ ...delivered, adjustmentRefundedCents: 40, refundedCents: 40 }),
      ),
    ).toBe("issuable");
  });

  it("baisse M2 de plus de la moitié : facturée, pas « remboursée en totalité »", () => {
    expect(
      cardInvoiceVerdict(
        candidate({
          totalCents: 300,
          billableCents: 300,
          chargedCents: 1_000,
          adjustmentRefundedCents: 700,
          refundedCents: 700,
        }),
      ),
    ).toBe("issuable");
  });

  /** Régression : ajustement + retour couvraient le total, une vente de 100 restait sans facture. */
  it("total 100, encaissé 130, ajustement 30, retour 80 : `issuable` (était `fully_refunded`)", () => {
    expect(
      cardInvoiceVerdict(
        candidate({
          totalCents: 100,
          billableCents: 100,
          chargedCents: 130,
          adjustmentRefundedCents: 30,
          refundedCents: 110,
        }),
      ),
    ).toBe("issuable");
  });

  it("hausse, baisse puis retour total : `fully_refunded`", () => {
    // Commandé 100, hausse encaissée +30 (130), baisse rendue 30, retour de tout le livré.
    expect(
      cardInvoiceVerdict(
        candidate({
          paymentStatus: "refunded",
          totalCents: 100,
          billableCents: 100,
          chargedCents: 130,
          adjustmentRefundedCents: 30,
          refundedCents: 130,
        }),
      ),
    ).toBe("fully_refunded");
  });

  it("un remboursement hors plateforme qui couvre le facturable : `fully_refunded`", () => {
    expect(
      cardInvoiceVerdict(
        candidate({ billableCents: 600, chargedCents: 600, totalCents: 1_000, refundedCents: 600 }),
      ),
    ).toBe("fully_refunded");
  });
});

describe("outsideCardInvoicing — le filtre du réveil au solde", () => {
  it.each<[string, Partial<CardInvoiceCandidate>, boolean]>([
    ["une carte pro", {}, false],
    ["une carte pas encore encaissée", { paymentStatus: "pending" }, false],
    ["au compte", { paymentStatus: "not_required" }, true],
    ["publique", { clientele: "public" }, true],
    ["sans société", { companyId: null }, true],
    ["gratuite", { totalCents: 0 }, true],
    ["annulée", { cancelled: true }, true],
  ])("%s → %s", (_label, overrides, outside) => {
    expect(outsideCardInvoicing(candidate(overrides))).toBe(outside);
  });
});

describe("cardInvoiceDueOn", () => {
  it("le jour du paiement, jamais avant l'émission", () => {
    expect(cardInvoiceDueOn("2026-09-28", "2026-09-30")).toBe("2026-09-30");
    expect(cardInvoiceDueOn("2026-09-30", "2026-09-30")).toBe("2026-09-30");
  });
});
