import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import { OrderCardSubjectWithoutIntentError } from "../../../domain/errors/order-payment-errors.js";
import { OrderPaidAfterCancellationEvent } from "../../../cancellation/domain/events/order-paid-after-cancellation.event.js";
import { OrderPaidFact } from "../../../domain/events/order-paid.fact.js";
import { OrderPaymentFailedEvent } from "../../../domain/events/order-payment-failed.event.js";
import { CancelledOrderPaymentReader } from "../../../cancellation/domain/ports/cancelled-order-payment.reader.js";
import type { OrderCardStanding } from "../../../domain/ports/order-card-standing.reader.js";
import { HeldAfterCommit } from "../../../../../platform/database/__tests__/held-after-commit.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { RecordingJournal } from "../../../../../platform/journal/__tests__/recording-journal.js";
import { RecordingDurable } from "../../commands/__tests__/durable-doubles.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { CardIncreaseProposal } from "../../../domain/entities/card-increase-proposal.js";
import { ComplementWithoutProposalError } from "../../../domain/errors/card-increase-proposal-errors.js";
import { OrderComplementPaidLateEvent } from "../../../domain/events/order-complement-paid-late.event.js";
import { OrderComplementSettlement } from "../order-complement-settlement.js";
import { OrderRefundOutcomes } from "../order-refund-outcomes.js";
import { proposalAt, RecordingProposals, RecordingWake } from "./card-increase-doubles.js";
import { OrderSubjectSettlement } from "../order-subject-settlement.js";
import { RecordingRefundStatus } from "./order-refund-outcome-doubles.js";
import {
  FixedStandings,
  RecordingLock,
  settlingRepo,
  standing,
  Steps,
} from "./order-card-doubles.js";

/** La commande annulée NON payée qui porte l'intention (C3.4), ou aucune. */
class CancelledOrders extends CancelledOrderPaymentReader {
  constructor(private readonly refundDue: string | null) {
    super();
  }

  cancelledOrderOf(): Promise<string | null> {
    return Promise.resolve(this.refundDue);
  }
}

const ORDER = { type: "order", id: "ord_1" } as const;

function build(
  options: {
    readonly row?: OrderCardStanding | null;
    readonly crossed?: string | null;
    readonly refundDue?: string | null;
    readonly proposal?: CardIncreaseProposal | null;
    readonly proposalWritten?: boolean;
  } = {},
) {
  const steps = new Steps();
  const durable = new RecordingDurable();
  const journal = new RecordingJournal();
  const row = options.row === undefined ? standing() : options.row;
  const standings = new FixedStandings(row === null ? [] : [row]);
  const proposals = new RecordingProposals(
    steps,
    options.proposal ?? null,
    options.proposalWritten ?? true,
  );
  const wake = new RecordingWake();
  const afterCommit = new HeldAfterCommit();
  const settlement = new OrderSubjectSettlement(
    new RecordingLock(steps),
    standings,
    settlingRepo(steps, options.crossed === undefined ? "ord_1" : options.crossed),
    new CancelledOrders(options.refundDue ?? null),
    durable,
    new OrderRefundOutcomes(
      standings,
      new RecordingRefundStatus(),
      journal,
      durable,
      new HeldAfterCommit(),
      new RecordingPublisher(),
    ),
    new OrderComplementSettlement(
      new RecordingLock(steps),
      proposals,
      durable,
      afterCommit,
      wake,
      new FixedClock(new Date(0)),
      journal,
      standings,
    ),
  );
  return { steps, durable, journal, standings, settlement, proposals, wake, afterCommit };
}

/**
 * **La commande, sujet du bloc `card-payment`** (plan M2, §3.3, §3.6, §4.4) —
 * ce que faisait `ConfirmOrderPaymentHandler`, retiré au lot P0.c2, appelé
 * désormais par le webhook des cartes dans SA transaction.
 */
describe("OrderSubjectSettlement — un encaissement", () => {
  it("applied : verrou de la commande d'abord, `markPaid` par l'intention, `order.paid` au franchissement", async () => {
    const { steps, durable, settlement } = build();

    await expect(settlement.onPaid(ORDER, "pay_1", 2_340, "first")).resolves.toBe("applied");

    expect(steps.seen).toEqual(["lock:ord_1", "markPaid:pi_1"]);
    expect(durable.facts).toEqual([new OrderPaidFact("ord_1").durableFact()]);
  });

  it("🔴 already_applied : rien n'a franchi (déjà payée, webhook rejoué) — RIEN n'est publié", async () => {
    const { durable, settlement } = build({ crossed: null, row: standing({ settled: "paid" }) });

    await expect(settlement.onPaid(ORDER, "pay_1", 2_340, "first")).resolves.toBe(
      "already_applied",
    );

    expect(durable.facts).toEqual([]);
  });

  it("refused : annulée et non payée — la cloche « à rembourser » part, une fois, avec la commande", async () => {
    const { durable, settlement } = build({
      crossed: null,
      refundDue: "ord_1",
      row: standing({ cancelled: true, settled: "failed" }),
    });

    await expect(settlement.onPaid(ORDER, "pay_1", 2_340, "first")).resolves.toBe("refused");

    expect(durable.facts).toEqual([new OrderPaidAfterCancellationEvent("ord_1").durableFact()]);
  });

  /**
   * Régression gardée de C4.11 bis (`vitruve` BLOQUANT 2) : une annulée déjà
   * payée puis remboursée qui voit un encaissement relivré ne doit pas passer
   * pour « encaissée après annulation » — elle serait remboursée deux fois.
   */
  it("refused sans cloche : annulée APRÈS l'encaissement — le lecteur ne la dit pas à rembourser", async () => {
    const { durable, settlement } = build({
      crossed: null,
      refundDue: null,
      row: standing({ cancelled: true, settled: "paid" }),
    });

    await expect(settlement.onPaid(ORDER, "pay_1", 2_340, "first")).resolves.toBe("refused");

    expect(durable.facts).toEqual([]);
  });

  it("refuse une commande sans intention : incohérence de base, nommée", async () => {
    const { steps, settlement } = build({ row: standing({ providerRef: null }) });

    await expect(settlement.onPaid(ORDER, "pay_1", 2_340, "first")).rejects.toBeInstanceOf(
      OrderCardSubjectWithoutIntentError,
    );
    expect(steps.seen).toEqual(["lock:ord_1"]);
  });

  it("refuse une commande inconnue", async () => {
    const { settlement } = build({ row: null });

    await expect(settlement.onPaid(ORDER, "pay_1", 2_340, "first")).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
  });
});

describe("OrderSubjectSettlement — un refus de la banque", () => {
  it("`markPaymentFailed` sous le verrou, et le fait durable du refus avec la COMMANDE", async () => {
    const { steps, durable, settlement } = build();

    await settlement.onPaymentFailed(ORDER, "pay_1", "first");

    expect(steps.seen).toEqual(["lock:ord_1", "markPaymentFailed:pi_1"]);
    expect(durable.facts).toEqual([new OrderPaymentFailedEvent("ord_1", "refused").durableFact()]);
  });

  it("🔴 un refus rejoué ne franchit rien et ne publie rien — pas deux courriels", async () => {
    const { durable, settlement } = build({ crossed: null });

    await settlement.onPaymentFailed(ORDER, "pay_1", "first");

    expect(durable.facts).toEqual([]);
  });
});

describe("OrderSubjectSettlement — ce que le bloc demande", () => {
  it("isCancelled se lit sous le verrou de la commande", async () => {
    const { steps, settlement } = build({ row: standing({ cancelled: true }) });

    await expect(settlement.isCancelled(ORDER)).resolves.toBe(true);
    expect(steps.seen).toEqual(["lock:ord_1"]);
  });

  it("describe : le numéro et l'écran de la commande au back-office", async () => {
    const { settlement } = build();

    await expect(settlement.describe(ORDER)).resolves.toEqual({
      label: "Commande ORD-0001",
      link: "/commandes/ord_1",
    });
  });

  it("claim : revendique son intention, au montant de son paiement, en premier paiement, au règlement qu'elle voit", async () => {
    const { settlement } = build({ row: standing({ settled: "failed" }) });

    await expect(settlement.claim("lfc-stripe", "pi_1")).resolves.toEqual({
      subject: ORDER,
      amountCents: 2_340,
      role: "first",
      settled: "failed",
    });
  });

  it("claim : une intention qu'aucune commande ne porte n'est pas à elle", async () => {
    const { settlement } = build();

    await expect(settlement.claim("lfc-stripe", "pi_lien")).resolves.toBeNull();
  });

  it("referencesSince : les commandes à intention depuis la borne, sous la même forme", async () => {
    const { settlement, standings } = build({ row: standing({ settled: "paid" }) });
    const since = new Date(Date.UTC(2030, 0, 1));

    await expect(settlement.referencesSince(since)).resolves.toEqual([
      { subject: ORDER, amountCents: 2_340, role: "first", settled: "paid", providerRef: "pi_1" },
    ]);
    expect(standings.sinceAsked).toEqual([since]);
  });
});

/** Le remboursement (plan M2, lot P1.b) : le verrou, et l'issue rendue au commerce. */
describe("OrderSubjectSettlement — un remboursement", () => {
  it("lockSubject prend le verrou de la commande, et rien d'autre", async () => {
    const { steps, durable, settlement } = build();

    await settlement.lockSubject(ORDER);

    expect(steps.seen).toEqual(["lock:ord_1"]);
    expect(durable.facts).toEqual([]);
  });

  it("onRefundOutcome délègue à la vue du remboursement : son journal, sous le numéro de la commande", async () => {
    const { journal, settlement } = build();

    await settlement.onRefundOutcome(ORDER, {
      kind: "attempted",
      requestId: "req_1",
      generation: 1,
      failure: "unavailable",
      providerRef: null,
      position: {
        subject: ORDER,
        chargedCents: 2_340,
        refundedCents: 0,
        refundedByNature: { return: 0, adjustment: 0, unattributed: 0 },
        inFlightByForm: { remainder: 0, amount: 0, unattributed: 0 },
      },
    });

    expect(journal.facts).toEqual([
      {
        type: "order.refund_attempt_failed",
        subjectType: "order",
        subjectId: "ord_1",
        payload: { subjectLabel: "ORD-0001", generation: 1, failure: "unavailable" },
      },
    ]);
  });
});

/** Plan S2, §2.5 : un complément de hausse, routé sur le rôle de la ligne. */
describe("OrderSubjectSettlement — un complément encaissé", () => {
  const complement = (settlement: OrderSubjectSettlement) =>
    settlement.onPaid(ORDER, "pay_2", 1_200, "complement");

  it("en attente : le projet passe `ready`, et l'exécuteur est réveillé APRÈS validation", async () => {
    const { steps, settlement, proposals, wake, afterCommit } = build({
      proposal: proposalAt("awaiting_payment"),
    });

    await expect(complement(settlement)).resolves.toBe("applied");

    expect(steps.seen).toEqual([
      "lock:ord_1",
      "lockProposal:pay_2",
      "saveProposal:awaiting_payment→ready",
    ]);
    expect(proposals.saved).toEqual(["ready"]);
    expect(wake.woken).toEqual([]);
    await afterCommit.commit();
    expect(wake.woken).toEqual(["prop_1"]);
  });

  /** Régression (vitruve v3) : un complément ne marque jamais le premier paiement. */
  it("🔴 ne marque jamais la commande payée, ne publie pas `order.paid`", async () => {
    const { steps, durable, settlement } = build({ proposal: proposalAt("awaiting_payment") });

    await complement(settlement);

    expect(steps.seen.some((step) => step.startsWith("markPaid"))).toBe(false);
    expect(durable.facts).toEqual([]);
  });

  it("abandonné : fermé, et le fait durable « payé tard » part avec le projet", async () => {
    const { settlement, durable, proposals } = build({ proposal: proposalAt("abandoned") });

    await expect(complement(settlement)).resolves.toBe("refused");

    expect(proposals.saved).toEqual(["closed"]);
    expect(durable.facts).toEqual([
      new OrderComplementPaidLateEvent("ord_1", "prop_1", "pay_2", 1_200).durableFact(),
    ]);
  });

  it("R12 : chaque transition écrite part au journal, sous le numéro de la commande", async () => {
    const paid = build({ proposal: proposalAt("awaiting_payment") });
    await complement(paid.settlement);
    const late = build({ proposal: proposalAt("abandoned") });
    await complement(late.settlement);

    const payload = { subjectLabel: "ORD-0001", complementCents: 1_200 };
    expect(paid.journal.facts).toEqual([
      { type: "order.card_increase_paid", subjectType: "order", subjectId: "ord_1", payload },
    ]);
    expect(late.journal.facts).toEqual([
      { type: "order.card_increase_closed", subjectType: "order", subjectId: "ord_1", payload },
    ]);
  });

  it("R12 : un rejeu ou une transition qui n'écrit rien ne journalise rien", async () => {
    const replay = build({ proposal: proposalAt("ready") });
    await complement(replay.settlement);
    const crossed = build({ proposal: proposalAt("awaiting_payment"), proposalWritten: false });
    await complement(crossed.settlement);

    expect(replay.journal.facts).toEqual([]);
    expect(crossed.journal.facts).toEqual([]);
  });

  it.each(["ready", "applied", "refused", "stalled", "closed"] as const)(
    "%s : un rejeu — rien ne franchit, rien n'est écrit",
    async (state) => {
      const { settlement, proposals, durable } = build({ proposal: proposalAt(state) });

      await expect(complement(settlement)).resolves.toBe("already_applied");

      expect(proposals.saved).toEqual([]);
      expect(durable.facts).toEqual([]);
    },
  );

  it("une transition conditionnée qui n'écrit rien est un rejeu, sans réveil", async () => {
    const { settlement, wake, afterCommit } = build({
      proposal: proposalAt("awaiting_payment"),
      proposalWritten: false,
    });

    await expect(complement(settlement)).resolves.toBe("already_applied");
    await afterCommit.commit();
    expect(wake.woken).toEqual([]);
  });

  /** Régression (vitruve v3) : sans projet, 12 € étaient gardés en silence par le premier. */
  it("🔴 aucun projet : erreur bruyante, la commande n'est pas touchée", async () => {
    const { steps, settlement } = build({ proposal: null });

    await expect(complement(settlement)).rejects.toBeInstanceOf(ComplementWithoutProposalError);
    expect(steps.seen).toEqual(["lock:ord_1", "lockProposal:pay_2"]);
  });

  it("un projet d'une autre commande : la même erreur", async () => {
    const { settlement } = build({ proposal: proposalAt("awaiting_payment", "ord_9") });

    await expect(complement(settlement)).rejects.toBeInstanceOf(ComplementWithoutProposalError);
  });

  it("un refus de la banque sur un complément ne touche pas la commande", async () => {
    const { steps, durable, settlement } = build({ proposal: proposalAt("awaiting_payment") });

    await settlement.onPaymentFailed(ORDER, "pay_2", "complement");

    expect(steps.seen).toEqual([]);
    expect(durable.facts).toEqual([]);
  });
});
