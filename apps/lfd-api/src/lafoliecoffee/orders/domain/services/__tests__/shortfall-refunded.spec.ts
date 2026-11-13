import {
  type RefundPartShape,
  shortfallRefundedCentsOf,
  SHORTFALL_REFUND_REASON,
} from "../shortfall-refunded.js";

/**
 * Le courriel du reste rendu (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 7) : un montant
 * n'est écrit au client que pour une part du reste, rendue par le prestataire.
 */

const PART: RefundPartShape = {
  refundId: "ref_1",
  requestId: "req_1",
  source: "provider",
  status: "succeeded",
  amountCents: 1_140,
};

const SHORTFALL = [{ requestId: "req_1", reason: SHORTFALL_REFUND_REASON }];

describe("shortfallRefundedCentsOf", () => {
  it("rend le montant d'une part du reste rendue par le prestataire", () => {
    expect(shortfallRefundedCentsOf("ref_1", [PART], SHORTFALL)).toBe(1_140);
  });

  it("lit la part nommée, pas une autre de la même commande", () => {
    const other: RefundPartShape = { ...PART, refundId: "ref_2", amountCents: 300 };

    expect(shortfallRefundedCentsOf("ref_2", [PART, other], SHORTFALL)).toBe(300);
  });

  it("n'écrit rien pour « Réglé autrement » : le client n'a rien reçu de lisible", () => {
    expect(
      shortfallRefundedCentsOf("ref_1", [{ ...PART, source: "manual" }], SHORTFALL),
    ).toBeNull();
  });

  it.each(["pending", "failed", "canceled"])("n'écrit rien pour une ligne %s", (status) => {
    expect(shortfallRefundedCentsOf("ref_1", [{ ...PART, status }], SHORTFALL)).toBeNull();
  });

  it.each(["revision", "revision_refused", "cancellation"])(
    "n'écrit rien pour une demande de raison %s : elle a son propre courriel",
    (reason) => {
      expect(
        shortfallRefundedCentsOf("ref_1", [PART], [{ requestId: "req_1", reason }]),
      ).toBeNull();
    },
  );

  it("n'écrit rien pour un remboursement fait hors plateforme, sans demande", () => {
    expect(shortfallRefundedCentsOf("ref_1", [{ ...PART, requestId: null }], SHORTFALL)).toBeNull();
  });

  it("n'écrit rien quand la ligne ou sa demande est introuvable", () => {
    expect(shortfallRefundedCentsOf("ref_x", [PART], SHORTFALL)).toBeNull();
    expect(shortfallRefundedCentsOf("ref_1", [PART], [])).toBeNull();
  });
});
