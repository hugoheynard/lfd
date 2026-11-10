import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../../platform/journal/__tests__/recording-journal.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { CardIncreaseProposal } from "../../../domain/entities/card-increase-proposal.js";
import type { RevisableOrder, RevisionActor } from "../../../domain/entities/order-revision.js";
import {
  CardComplementCancellationUnavailableError,
  CardComplementJustPaidError,
  NoComplementAwaitingPaymentError,
} from "../../../domain/errors/card-increase-proposal-errors.js";
import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import { CardIncreaseAbandonment } from "../../services/card-increase-abandonment.js";
import { RevisionWall } from "../../services/revision-wall.js";
import { proposalAt, RecordingProposals } from "../../services/__tests__/card-increase-doubles.js";
import { RecordingLock, Steps } from "../../services/__tests__/order-card-doubles.js";
import { AbandonCardIncreaseCommand } from "../abandon-card-increase.command.js";
import { AbandonCardIncreaseHandler } from "../abandon-card-increase.handler.js";
import { FixedProposalReader, IncreaseCardPayments } from "./card-increase-scene.js";
import { FixedRevisableOrders, NOW, OneRoleAccess, placedOrder } from "./revision-scene.js";

/**
 * **« Abandonner » le complément** (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`, §2.5) —
 * l'intention annulée hors transaction, puis la transition conditionnée sous
 * `orders`, la cause au journal.
 */

const CUSTOMER = { kind: "customer", userId: "usr_1" } as const;
const STAFF = { kind: "staff", staffId: "stf_1" } as const;

async function scene(
  live: CardIncreaseProposal | null,
  options: { readonly role?: "orders" | null; readonly written?: boolean } = {},
) {
  const order: RevisableOrder = await placedOrder({
    paymentStatus: "paid",
    stripePaymentIntentId: "pi_1",
  });
  const steps = new Steps();
  const reader = new FixedProposalReader(steps, live);
  const proposals = new RecordingProposals(steps, live, options.written ?? true);
  const cards = new IncreaseCardPayments(steps);
  const journal = new RecordingJournal();
  const handler = new AbandonCardIncreaseHandler(
    new RevisionWall(
      new FixedRevisableOrders(order),
      new OneRoleAccess(options.role === undefined ? "orders" : options.role),
    ),
    reader,
    new CardIncreaseAbandonment(reader, proposals, cards, journal, new FixedClock(NOW)),
    new RecordingLock(steps),
    new DirectUnitOfWork(),
  );
  const abandon = (actor: RevisionActor) =>
    handler.execute(new AbandonCardIncreaseCommand("ord_1", actor));
  return { abandon, steps, cards, journal, proposals, order };
}

describe("AbandonCardIncreaseHandler", () => {
  it("le client : annulation hors verrou, puis orders → projet abandonné, cause au journal", async () => {
    const { abandon, steps, journal, order } = await scene(proposalAt("awaiting_payment"));

    await abandon(CUSTOMER);

    expect(steps.seen).toEqual([
      "liveOf:ord_1",
      "cancel:pay_2",
      "lock:ord_1",
      "lockLiveProposal:ord_1",
      "saveProposal:awaiting_payment→abandoned",
    ]);
    expect(journal.facts).toEqual([
      {
        type: "order.card_increase_abandoned",
        subjectType: "order",
        subjectId: "ord_1",
        payload: { subjectLabel: order.orderNumber, complementCents: 1_200, cause: "customer" },
      },
    ]);
  });

  it("l'équipe, depuis la fiche : la cause est `staff`", async () => {
    const { abandon, journal } = await scene(proposalAt("awaiting_payment"));

    await abandon(STAFF);

    expect(journal.facts[0]?.payload).toMatchObject({ cause: "staff" });
  });

  it("le mur : un client hors de la commande ne la trouve pas (404), rien n'est annulé", async () => {
    const { abandon, steps } = await scene(proposalAt("awaiting_payment"), { role: null });

    await expect(abandon({ kind: "customer", userId: "usr_9" })).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
    expect(steps.seen).toEqual([]);
  });

  it.each([null, "ready"] as const)(
    "rien qui attend son paiement (%s) : refus nommé",
    async (state) => {
      const { abandon, steps } = await scene(state === null ? null : proposalAt(state));

      await expect(abandon(CUSTOMER)).rejects.toBeInstanceOf(NoComplementAwaitingPaymentError);
      expect(steps.seen).toEqual(["liveOf:ord_1"]);
    },
  );

  it("payé pendant l'annulation : « vient d'être payé », la transaction n'est pas ouverte", async () => {
    const { abandon, cards, steps } = await scene(proposalAt("awaiting_payment"));
    cards.cancellation = { kind: "already_paid" };

    await expect(abandon(CUSTOMER)).rejects.toBeInstanceOf(CardComplementJustPaidError);
    expect(steps.seen).not.toContain("lock:ord_1");
  });

  it("le prestataire ne répond pas : « réessayez »", async () => {
    const { abandon, cards } = await scene(proposalAt("awaiting_payment"));
    cards.cancellation = { kind: "unavailable", reason: "timeout" };

    await expect(abandon(CUSTOMER)).rejects.toBeInstanceOf(
      CardComplementCancellationUnavailableError,
    );
  });

  it("la transition conditionnée n'écrit rien (payé entre-temps) : refus nommé, rien au journal", async () => {
    const { abandon, journal } = await scene(proposalAt("awaiting_payment"), { written: false });

    await expect(abandon(CUSTOMER)).rejects.toBeInstanceOf(CardComplementJustPaidError);
    expect(journal.facts).toEqual([]);
  });
});
