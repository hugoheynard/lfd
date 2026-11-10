import {
  CardOrderNotRevisableError,
  RevisionFreesAccountOrderError,
  RevisionRequiresPaymentError,
} from "../../errors/order-revision-errors.js";
import { CardIncreaseNotApplicableError } from "../../errors/card-increase-proposal-errors.js";
import { Order } from "../order.js";
import type { RevisableOrder } from "../order-revision.js";
import { input, line, placed, revised } from "./revisable-order.fixture.js";

/**
 * **Le règlement d'une révision, trié par l'agrégat** (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`, R2, R2 bis) :
 * `recompose` rend la révision et son règlement sans lever ; M1 (`revise`)
 * refuse tout ce qui n'est pas `same_settlement`, comme avant.
 */

/** 10 croissants à 2 € HT, TVA 5,5 % : 21,10 €. */
const TEN = [line("VIE-001", 10)];
const MORE = [line("VIE-001", 20)];
const LESS = [line("VIE-001", 5)];

function card(paymentStatus: RevisableOrder["paymentStatus"]): RevisableOrder {
  return placed({ paymentStatus, stripePaymentIntentId: "pi_1" });
}

describe("Order.recompose — le tri du règlement (R2 bis)", () => {
  it("au compte : `same_settlement`, et la ligne au compte suit (onAccount)", () => {
    const { revision, settlement } = Order.recompose(placed(), revised(placed(), { lines: MORE }));
    expect(settlement).toEqual({ kind: "same_settlement" });
    expect(revision.onAccount).toBe(true);
  });

  it("carte encaissée, hausse : `card_complement` de l'écart exact", () => {
    const paid = card("paid");
    const { revision, settlement } = Order.recompose(paid, revised(paid, { lines: MORE }));
    expect(settlement).toEqual({
      kind: "card_complement",
      complementCents: revision.totalAfterCents - paid.totalCents,
    });
  });

  /** R2 (régression vitruve v2) : `deferPayment` faisait passer une carte pour « au compte ». */
  it("carte encaissée : la révision ne passe jamais au compte", () => {
    const paid = card("paid");
    const { revision } = Order.recompose(paid, revised(paid, { lines: MORE }));
    expect(revision.onAccount).toBe(false);
  });

  it.each([
    ["une baisse", LESS, "decrease"],
    ["un total égal", TEN, "same_total"],
  ] as const)("carte encaissée, %s : refusée avec sa raison, sans lever", (_, lines, reason) => {
    const paid = card("paid");
    const { settlement } = Order.recompose(paid, revised(paid, { lines, note: "porte B" }));
    expect(settlement).toEqual({ kind: "card_not_revisable", reason });
  });

  it.each(["pending", "failed"] as const)(
    "premier paiement %s : `unsettled`, même pour une hausse",
    (status) => {
      const due = card(status);
      const { settlement, revision } = Order.recompose(due, revised(due, { lines: MORE }));
      expect(settlement).toEqual({ kind: "card_not_revisable", reason: "unsettled" });
      expect(revision.onAccount).toBe(false);
    },
  );
});

describe("Order.revise — M1 inchangé sur une carte (R2 bis)", () => {
  it.each([
    ["une hausse payée", "paid", MORE, "increase"],
    ["une baisse payée", "paid", LESS, "decrease"],
    ["une carte attendue", "pending", MORE, "unsettled"],
  ] as const)(
    "refuse %s, avec la raison et le message d'aujourd'hui",
    (_, status, lines, reason) => {
      const order = card(status);
      const attempt = () => Order.revise(order, revised(order, { lines }));
      expect(attempt).toThrow(CardOrderNotRevisableError);
      expect(attempt).toThrow(
        "Commande réglée par carte : annulez-la et recommandez, ou demandez au commerce.",
      );
      try {
        attempt();
      } catch (error) {
        expect(error).toMatchObject({ reason, code: "orders.revise.card_settled" });
      }
    },
  );

  /** Non-régression R2 : les deux gardes de M1 restent jugées sur la composition. */
  it("refuse toujours une commande au compte ramenée à 0 €", () => {
    expect(() =>
      Order.revise(placed(), revised(placed(), { lines: [line("PAI-001", 1, 0)] })),
    ).toThrow(RevisionFreesAccountOrderError);
  });

  it("refuse toujours qu'une commande gratuite devienne payante", () => {
    const free = placed({}, input({ lines: [line("VIE-001", 10, 0)] }));
    expect(() =>
      Order.revise(free, revised(free, { lines: [line("VIE-001", 10, 0), line("PAI-001", 1)] })),
    ).toThrow(RevisionRequiresPaymentError);
  });
});

/** Plan S2, §2.4, R15 : la hausse payée par un complément — et l'équipe qui n'en a pas le chemin. */
describe("Order.reviseWithComplement — la hausse par carte", () => {
  it("une hausse sur une carte encaissée : la révision et son complément exact", () => {
    const paid = card("paid");
    const { revision, settlement } = Order.reviseWithComplement(
      paid,
      revised(paid, { lines: MORE }),
      "customer",
    );
    expect(settlement).toEqual({
      kind: "card_complement",
      complementCents: revision.totalAfterCents - paid.totalCents,
    });
  });

  it.each([
    ["une baisse", "paid", LESS, "decrease"],
    ["un total égal", "paid", TEN, "same_total"],
    ["une carte attendue", "pending", MORE, "unsettled"],
  ] as const)("refuse %s, nommée par sa raison", (_, status, lines, reason) => {
    const order = card(status);
    const attempt = () =>
      Order.reviseWithComplement(order, revised(order, { lines, note: "porte B" }), "customer");
    expect(attempt).toThrow(CardOrderNotRevisableError);
    try {
      attempt();
    } catch (error) {
      expect(error).toMatchObject({ reason, code: "orders.revise.card_settled" });
    }
  });

  it("R15 : l'équipe qui augmente une carte est refusée, avec le geste de sortie", () => {
    const paid = card("paid");
    const attempt = () => Order.reviseWithComplement(paid, revised(paid, { lines: MORE }), "staff");
    expect(attempt).toThrow(
      "l'équipe ne peut pas l'augmenter. Demandez au client de modifier sa commande, ou passez une seconde commande.",
    );
    try {
      attempt();
    } catch (error) {
      expect(error).toMatchObject({ reason: "increase_by_staff" });
    }
  });

  it("R15 : M1 dit la même chose à l'équipe qui augmente une carte (la demande M4 appliquée)", () => {
    const paid = card("paid");
    const attempt = () => Order.revise(paid, revised(paid, { lines: MORE }), "staff");
    expect(attempt).toThrow(CardOrderNotRevisableError);
    try {
      attempt();
    } catch (error) {
      expect(error).toMatchObject({ reason: "increase_by_staff" });
    }
  });

  it("une commande au compte n'a pas de complément : refus nommé", () => {
    expect(() =>
      Order.reviseWithComplement(placed(), revised(placed(), { lines: MORE }), "customer"),
    ).toThrow(CardIncreaseNotApplicableError);
  });
});
