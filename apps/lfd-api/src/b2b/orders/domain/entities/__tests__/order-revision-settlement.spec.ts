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
 * **Le règlement d'une révision, trié par l'agrégat** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.2) :
 * `recompose` rend la révision et son règlement sans lever ; M1 (`revise`)
 * admet `same_settlement` et la baisse carte rendue (`card_refund`, plan
 * `documentation/commandes/modification/plan-s1-la-baisse.md`, R2, R5 bis).
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

  it("plan S1, R2 : carte encaissée, baisse : `card_refund` de l'écart exact", () => {
    const paid = card("paid");
    const { revision, settlement } = Order.recompose(paid, revised(paid, { lines: LESS }));
    expect(settlement).toEqual({
      kind: "card_refund",
      refundCents: paid.totalCents - revision.totalAfterCents,
    });
    expect(revision.onAccount).toBe(false);
  });

  it("plan S1, Q2 : carte encaissée, total égal : `same_settlement`, aucun argent ne bouge", () => {
    const paid = card("paid");
    const { settlement } = Order.recompose(paid, revised(paid, { lines: TEN, note: "porte B" }));
    expect(settlement).toEqual({ kind: "same_settlement" });
  });

  it.each([
    ["une baisse", LESS],
    ["une hausse", MORE],
    ["un total égal", TEN],
  ] as const)("plan S1, R2 : carte déjà rendue en entier, %s : `refunded`", (_, lines) => {
    const refunded = card("refunded");
    const { settlement } = Order.recompose(refunded, revised(refunded, { lines, note: "B" }));
    expect(settlement).toEqual({ kind: "card_not_revisable", reason: "refunded" });
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

describe("Order.revise — M1 sur une carte (plan S2, R2 bis ; plan S1, R5 bis)", () => {
  it.each(["customer", "staff"] as const)(
    "plan S1 : une baisse payée passe (%s), et son règlement remonte",
    (by) => {
      const paid = card("paid");
      const { revision, settlement } = Order.revise(paid, revised(paid, { lines: LESS }), by);
      expect(settlement).toEqual({
        kind: "card_refund",
        refundCents: paid.totalCents - revision.totalAfterCents,
      });
    },
  );

  it("plan S1, Q2 : un changement à total égal sur une carte payée passe, sans argent", () => {
    const paid = card("paid");
    const { settlement, revision } = Order.revise(
      paid,
      revised(paid, { lines: TEN, note: "porte B" }),
    );
    expect(settlement).toEqual({ kind: "same_settlement" });
    expect(revision.changes).toEqual(["note"]);
  });

  it("plan S1, R1 : une carte déjà rendue en entier est refusée, avec sa phrase", () => {
    const refunded = card("refunded");
    const attempt = () => Order.revise(refunded, revised(refunded, { lines: LESS }));
    expect(attempt).toThrow(CardOrderNotRevisableError);
    expect(attempt).toThrow("Cette commande a déjà été remboursée en entier");
    try {
      attempt();
    } catch (error) {
      expect(error).toMatchObject({ reason: "refunded", code: "orders.revise.card_settled" });
    }
  });

  it.each([
    ["une hausse payée", "paid", MORE, "increase"],
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

  it("refuse une carte attendue, nommée par sa raison", () => {
    const order = card("pending");
    const attempt = () =>
      Order.reviseWithComplement(order, revised(order, { lines: MORE }), "customer");
    expect(attempt).toThrow(CardOrderNotRevisableError);
    try {
      attempt();
    } catch (error) {
      expect(error).toMatchObject({ reason: "unsettled", code: "orders.revise.card_settled" });
    }
  });

  it.each([
    ["une baisse", LESS],
    ["un total égal", TEN],
  ] as const)("plan S1, R5 bis : refuse %s — pas de complément à payer", (_, lines) => {
    const order = card("paid");
    const attempt = () =>
      Order.reviseWithComplement(order, revised(order, { lines, note: "porte B" }), "customer");
    expect(attempt).toThrow(CardIncreaseNotApplicableError);
    expect(attempt).toThrow("Cette modification ne fait pas monter le total");
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
