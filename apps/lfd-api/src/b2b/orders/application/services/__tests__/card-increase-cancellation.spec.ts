import { increaseCancellation } from "../../commands/__tests__/card-increase-scene.js";
import { proposalAt } from "./card-increase-doubles.js";

/**
 * **R9 — l'annulation d'une commande qui porte un projet de hausse vivant**
 * (plan `documentation/commandes/modification/plan-s2-la-hausse.md`) : dans
 * la transaction de l'annulation, sous son verrou ; l'intention d'un projet
 * qui attend son paiement n'est annulée qu'APRÈS validation ; un projet payé
 * est refusé sans remboursement propre — l'annulation rend tout.
 */

const LABEL = { orderId: "ord_1", orderNumber: "ORD-0001" };

describe("CardIncreaseCancellation — le projet vu par l'annulation (R9)", () => {
  it("aucun projet vivant : rien", async () => {
    const { cancellation, journal, proposals } = increaseCancellation();

    await cancellation.settleOnCancellation(LABEL);

    expect(proposals.saved).toEqual([]);
    expect(journal.types()).toEqual([]);
  });

  it("`awaiting_payment` : abandonné (cause `order_cancelled`), l'intention annulée APRÈS validation", async () => {
    const { cancellation, journal, proposals, steps, afterCommit } = increaseCancellation(
      proposalAt("awaiting_payment"),
    );

    await cancellation.settleOnCancellation(LABEL);

    expect(proposals.saved).toEqual(["abandoned"]);
    expect(journal.types()).toEqual(["order.card_increase_abandoned"]);
    expect(journal.facts[0]?.payload).toMatchObject({ cause: "order_cancelled" });
    expect(steps.seen).not.toContain("cancel:pay_2");

    await afterCommit.commit();

    expect(steps.seen.at(-1)).toBe("cancel:pay_2");
  });

  it.each(["ready", "stalled"] as const)(
    "`%s` : refusé `order_cancelled`, sans remboursement propre ni intention touchée",
    async (state) => {
      const { cancellation, journal, proposals, steps, afterCommit } = increaseCancellation(
        proposalAt(state),
      );

      await cancellation.settleOnCancellation(LABEL);
      await afterCommit.commit();

      expect(proposals.saved).toEqual(["refused"]);
      expect(journal.types()).toEqual(["order.card_increase_refused"]);
      expect(journal.facts[0]?.payload).toMatchObject({ refusal: "order_cancelled" });
      expect(steps.seen.filter((step) => step.startsWith("cancel:"))).toEqual([]);
    },
  );
});
