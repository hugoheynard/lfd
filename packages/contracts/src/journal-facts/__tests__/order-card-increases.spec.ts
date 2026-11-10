import { checkJournalFact } from "../index.js";

/**
 * La hausse d'une commande payée par carte (plan S2, R12) : chaque transition
 * nomme sa commande et son complément ; la cause d'un abandon est un ensemble
 * fermé. L'instant n'est comparé à aucune horloge.
 */
const BASE = { subjectLabel: "ORD-1", complementCents: 1_200 };

describe("les faits de la hausse par carte (plan S2, R12)", () => {
  it("la demande : le total visé et le délai de paiement", () => {
    const fact = { ...BASE, targetTotalCents: 5_200, expiresAt: "2030-03-12T10:15:00.000Z" };

    expect(checkJournalFact("order.card_increase_proposed", fact)).toBeNull();
    expect(checkJournalFact("order.card_increase_proposed", BASE)).not.toBeNull();
  });

  it("l'abandon : une cause du jeu fermé, et seulement elle", () => {
    for (const cause of ["expired", "customer", "staff", "replaced", "order_cancelled"]) {
      expect(checkJournalFact("order.card_increase_abandoned", { ...BASE, cause })).toBeNull();
    }
    expect(
      checkJournalFact("order.card_increase_abandoned", { ...BASE, cause: "timeout" }),
    ).not.toBeNull();
  });

  it("le refus porte son code ; la panne, ses essais et son échec", () => {
    expect(
      checkJournalFact("order.card_increase_refused", { ...BASE, refusal: "plan_closed" }),
    ).toBeNull();
    expect(
      checkJournalFact("order.card_increase_stalled", { ...BASE, attempts: 5, failure: "x" }),
    ).toBeNull();
  });

  it.each([
    "order.card_increase_paid",
    "order.card_increase_closed",
    "order.card_increase_relaunched",
    "order.card_increase_already_returned",
  ])("%s : la commande et le complément, rien d'autre", (type) => {
    expect(checkJournalFact(type, BASE)).toBeNull();
    expect(checkJournalFact(type, { ...BASE, paymentId: "pay_1" })).not.toBeNull();
  });
});
