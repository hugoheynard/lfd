import { CardRefundNotCoveredError } from "../../errors/revision-card-refund-errors.js";
import {
  splitCardRefund,
  splitRefund,
  type CardRefundSplitInput,
} from "../revision-card-refund.js";

/**
 * **La répartition d'une baisse sur les paiements** (plan
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.12) — pure : du
 * plus récent au plus ancien, chacun jusqu'à son reste, la somme exacte ; le
 * refus nomme le geste de sortie réel.
 */

function split(over: Partial<CardRefundSplitInput>) {
  return splitCardRefund({
    orderId: "ord_1",
    refundCents: 800,
    payments: [{ paymentId: "pay_1", remainderCents: 4_000 }],
    openRequests: [],
    by: "customer",
    ...over,
  });
}

function refusalOf(over: Partial<CardRefundSplitInput>): CardRefundNotCoveredError {
  try {
    split(over);
  } catch (error) {
    if (error instanceof CardRefundNotCoveredError) {
      return error;
    }
    throw error;
  }
  throw new Error("la répartition aurait dû refuser");
}

describe("splitCardRefund — R6", () => {
  it("un paiement : la baisse entière sur lui", () => {
    expect(split({})).toEqual([{ paymentId: "pay_1", amountCents: 800 }]);
  });

  it("deux paiements : le plus récent d'abord (R9 : 52 − 8 = 44, rendu sur le complément)", () => {
    const parts = split({
      payments: [
        { paymentId: "pay_1", remainderCents: 4_000 },
        { paymentId: "pay_2", remainderCents: 1_200 },
      ],
    });
    expect(parts).toEqual([{ paymentId: "pay_2", amountCents: 800 }]);
  });

  it("deux paiements touchés : le plus récent jusqu'à son reste, puis le précédent", () => {
    const parts = split({
      refundCents: 1_500,
      payments: [
        { paymentId: "pay_1", remainderCents: 4_000 },
        { paymentId: "pay_2", remainderCents: 1_200 },
      ],
    });
    expect(parts).toEqual([
      { paymentId: "pay_2", amountCents: 1_200 },
      { paymentId: "pay_1", amountCents: 300 },
    ]);
    expect(parts.reduce((sum, part) => sum + part.amountCents, 0)).toBe(1_500);
  });

  it("reste partiel : un paiement à moitié rendu ne donne que ce qui lui reste", () => {
    const parts = split({
      refundCents: 1_000,
      payments: [
        { paymentId: "pay_1", remainderCents: 4_000 },
        { paymentId: "pay_2", remainderCents: 300 },
      ],
    });
    expect(parts).toEqual([
      { paymentId: "pay_2", amountCents: 300 },
      { paymentId: "pay_1", amountCents: 700 },
    ]);
  });

  it("un paiement sans reste est sauté, sans part à zéro", () => {
    const parts = split({
      payments: [
        { paymentId: "pay_1", remainderCents: 4_000 },
        { paymentId: "pay_2", remainderCents: 0 },
      ],
    });
    expect(parts).toEqual([{ paymentId: "pay_1", amountCents: 800 }]);
  });

  it("restes insuffisants, rien d'arrêté : « en cours, réessayez »", () => {
    const refusal = refusalOf({ payments: [{ paymentId: "pay_1", remainderCents: 500 }] });
    expect(refusal.code).toBe("orders.revise.card_refund_not_covered");
    expect(refusal.stopped).toBe(false);
    expect(refusal.message).toContain("réessayez la modification quand il sera fait");
  });

  it("une demande `amount` arrêtée sur un paiement de R4 : le geste de l'équipe, au client « contactez-nous »", () => {
    const stopped = {
      payments: [{ paymentId: "pay_1", remainderCents: 0 }],
      openRequests: [{ paymentId: "pay_1", form: "amount", state: "stopped" }] as const,
    };
    expect(refusalOf(stopped).message).toContain("contactez-nous");
    const staff = refusalOf({ ...stopped, by: "staff" });
    expect(staff.stopped).toBe(true);
    expect(staff.message).toContain("relancez-le ou marquez-le rendu autrement");
  });

  it("une demande arrêtée HORS des paiements de R4 (complément refusé) n'est pas le geste de sortie", () => {
    const refusal = refusalOf({
      payments: [{ paymentId: "pay_1", remainderCents: 0 }],
      openRequests: [{ paymentId: "pay_refused", form: "amount", state: "stopped" }],
    });
    expect(refusal.stopped).toBe(false);
  });

  it("une `remainder` arrêtée n'est pas une `amount` : « en cours »", () => {
    const refusal = refusalOf({
      payments: [{ paymentId: "pay_1", remainderCents: 0 }],
      openRequests: [{ paymentId: "pay_1", form: "remainder", state: "stopped" }],
    });
    expect(refusal.stopped).toBe(false);
  });
});

describe("splitRefund — la répartition pure, partagée avec le reste d'un départ incomplet (plan E9, § 4.2)", () => {
  it("couvert : les parts, sans acteur ni commande", () => {
    expect(
      splitRefund({
        refundCents: 500,
        payments: [
          { paymentId: "pay_1", remainderCents: 400 },
          { paymentId: "pay_2", remainderCents: 200 },
        ],
        openRequests: [],
      }),
    ).toEqual({
      kind: "split",
      parts: [
        { paymentId: "pay_2", amountCents: 200 },
        { paymentId: "pay_1", amountCents: 300 },
      ],
    });
  });

  it("pas couvert : rend `uncovered` sans lever, avec la demande arrêtée qui en est la sortie", () => {
    expect(
      splitRefund({
        refundCents: 500,
        payments: [{ paymentId: "pay_1", remainderCents: 100 }],
        openRequests: [{ paymentId: "pay_1", form: "amount", state: "stopped" }],
      }),
    ).toEqual({ kind: "uncovered", hasStoppedAmount: true });
  });
});
