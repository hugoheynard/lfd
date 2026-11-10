import type { CardIncreaseProposal } from "../../../revision/domain/entities/card-increase-proposal.js";
import { NoComplementAwaitingPaymentError } from "../../../revision/domain/errors/card-increase-proposal-errors.js";
import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import { RevisionWall } from "../../../revision/application/services/revision-wall.js";
import { proposalAt } from "../../../revision/application/services/__tests__/card-increase-doubles.js";
import { Steps } from "../../services/__tests__/order-card-doubles.js";
import {
  FixedProposalReader,
  IncreaseCardPayments,
} from "../../../revision/application/commands/__tests__/card-increase-scene.js";
import {
  FixedRevisableOrders,
  OneRoleAccess,
  placedOrder,
} from "../../../revision/application/commands/__tests__/revision-scene.js";
import { GetComplementPaymentHandler } from "../get-complement-payment.handler.js";
import { GetComplementPaymentQuery } from "../get-complement-payment.query.js";

/**
 * **Le complément à payer, relu** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.4) — sous le
 * mur de la commande, l'intention relue chez le prestataire, jamais un secret
 * gardé chez nous.
 */
async function scene(live: CardIncreaseProposal | null, role: "orders" | null = "orders") {
  const steps = new Steps();
  const cards = new IncreaseCardPayments(steps);
  const handler = new GetComplementPaymentHandler(
    new RevisionWall(
      new FixedRevisableOrders(
        await placedOrder({ paymentStatus: "paid", stripePaymentIntentId: "pi_1" }),
      ),
      new OneRoleAccess(role),
    ),
    new FixedProposalReader(steps, live),
    cards,
  );
  const read = () => handler.execute(new GetComplementPaymentQuery("usr_1", "ord_1"));
  return { read, steps, cards };
}

describe("GetComplementPaymentHandler", () => {
  it("le complément en attente : relu chez le prestataire, avec son délai", async () => {
    const live = proposalAt("awaiting_payment");
    const { read, steps } = await scene(live);

    await expect(read()).resolves.toEqual({
      proposalId: "prop_1",
      complementCents: 1_200,
      clientSecret: "pi_complement_secret",
      publishableKey: "pk_test",
      expiresAt: live.toPersistence().expiresAt.toISOString(),
    });
    expect(steps.seen).toEqual(["liveOf:ord_1", "retrieve:pay_2"]);
  });

  it("le mur : hors de la commande, 404 — et le prestataire n'est pas appelé", async () => {
    const { read, steps } = await scene(proposalAt("awaiting_payment"), null);

    await expect(read()).rejects.toBeInstanceOf(OrderNotFoundError);
    expect(steps.seen).toEqual([]);
  });

  it.each([null, "ready", "stalled"] as const)(
    "aucun complément en attente (%s) : refus nommé",
    async (state) => {
      const { read } = await scene(state === null ? null : proposalAt(state));

      await expect(read()).rejects.toBeInstanceOf(NoComplementAwaitingPaymentError);
    },
  );

  it.each(["canceled", "succeeded"] as const)(
    "une intention %s chez le prestataire : rien à payer",
    async (intentState) => {
      const { read, cards } = await scene(proposalAt("awaiting_payment"));
      cards.intentState = intentState;

      await expect(read()).rejects.toBeInstanceOf(NoComplementAwaitingPaymentError);
    },
  );
});
