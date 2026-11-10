import type {
  AmountRefundRequest,
  RequestedCardRefund,
} from "../../../../../card-payment/channels/requests/index.js";
import type { DurableDelivery } from "../../../../../platform/outbox/durable-event.js";
import { RecordingJournal } from "../../../../../platform/journal/__tests__/recording-journal.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { OrderCardIncreaseRefusedEvent } from "../../../domain/events/order-card-increase-refused.event.js";
import { OrderComplementPaidLateEvent } from "../../../domain/events/order-complement-paid-late.event.js";
import { AT_PLACEMENT } from "../../../domain/services/order-sheet.js";
import {
  FixedCardRefundRequests,
  RecordingCardRefunds,
  RecordingNotifier,
} from "../../commands/__tests__/refund-doubles.js";
import { FixedProposalReader } from "../../commands/__tests__/card-increase-scene.js";
import { CardIncreaseBell } from "../../services/card-increase-bell.js";
import { CardIncreaseRefund } from "../../services/card-increase-refund.js";
import { IncreaseOrderLabels } from "../../services/increase-order-labels.js";
import { proposalAt, RecordingProposals } from "../../services/__tests__/card-increase-doubles.js";
import {
  FixedStandings,
  RecordingLock,
  standing,
  Steps,
} from "../../services/__tests__/order-card-doubles.js";
import { RefundLateComplement } from "../refund-late-complement.handler.js";
import { RefundRefusedIncrease } from "../refund-refused-increase.handler.js";
import {
  OneOrderReader,
  OneRecipientReader,
  orderView,
  RecordingMail,
} from "./payment-failure-doubles.js";

/**
 * **Rendre le complément, et le dire** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.8)
 * — les trois cas du reste, par les deux abonnés : tout, rien (l'annulation
 * a tout rendu), ou une partie (l'équipe en a rendu entre-temps). Toujours un
 * ajustement, jamais `requestRemainder`, sous le verrou `orders`.
 */

const COMPLEMENT = 1_200;
const delivery = (payload: Readonly<Record<string, unknown>>): DurableDelivery => ({
  eventId: "evt_1",
  type: "order.card_increase",
  payload,
});

/** Le reste du paiement du complément, tel que le bloc le lirait, et la lecture notée. */
class FixedRemainder extends FixedCardRefundRequests {
  constructor(
    private readonly steps: Steps,
    private readonly remainder: number,
  ) {
    super();
  }

  override remainderOf(paymentId: string): Promise<number> {
    this.steps.seen.push(`remainderOf:${paymentId}`);
    return Promise.resolve(this.remainder);
  }
}

/** Les demandes de montant, notées dans la chronologie. */
class AmountRefunds extends RecordingCardRefunds {
  readonly amounts: AmountRefundRequest[] = [];

  constructor(private readonly steps: Steps) {
    super();
  }

  override requestAmount(request: AmountRefundRequest): Promise<RequestedCardRefund> {
    this.steps.seen.push(`requestAmount:${String(request.amountCents)}`);
    this.amounts.push(request);
    return Promise.resolve({
      requestId: "req_9",
      paymentId: request.paymentId,
      form: "amount",
      announcedCents: request.amountCents,
      state: "to_issue",
    });
  }
}

function scene(remainder: number, state: "closed" | "refused") {
  const steps = new Steps();
  const proposal = proposalAt(state);
  const journal = new RecordingJournal();
  const notifier = new RecordingNotifier();
  const refunds = new AmountRefunds(steps);
  const refund = new CardIncreaseRefund(
    new RecordingLock(steps),
    new FixedRemainder(steps, remainder),
    refunds,
    new RecordingProposals(steps, proposal),
    new IncreaseOrderLabels(new FixedStandings([standing()])),
    journal,
    new CardIncreaseBell(notifier, new FixedClock(new Date(0))),
  );
  const mail = new RecordingMail();
  const refused = new RefundRefusedIncrease(
    refund,
    new FixedProposalReader(steps, proposal),
    new OneOrderReader({
      view: orderView("placed", "paid"),
      companyId: null,
      placedByUserId: "usr_placer",
      stripePaymentIntentId: "pi_1",
      clientele: "public",
      entryOrigin: null,
      loyaltyVoucherId: null,
      billedCustomer: null,
      buyerPhone: null,
      revision: AT_PLACEMENT,
    }),
    new OneRecipientReader("lea@example.test"),
    mail,
  );
  return {
    steps,
    journal,
    notifier,
    refunds,
    mail,
    refused,
    late: new RefundLateComplement(refund),
  };
}

const lateFact = () =>
  new OrderComplementPaidLateEvent("ord_1", "prop_1", "pay_2", COMPLEMENT).durableFact().payload;
const refusedFact = () =>
  new OrderCardIncreaseRefusedEvent(
    "ord_1",
    "prop_1",
    "pay_2",
    COMPLEMENT,
    "plan_closed",
  ).durableFact().payload;

describe("RefundLateComplement — le complément payé après l'abandon", () => {
  it("reste = complément : un ajustement `late_payment`, automatique, sous le verrou `orders`", async () => {
    const { late, steps, refunds, journal, notifier } = scene(COMPLEMENT, "closed");

    await late.handle(delivery(lateFact()));

    expect(steps.seen).toEqual([
      "lock:ord_1",
      "lockProposal:pay_2",
      "remainderOf:pay_2",
      `requestAmount:${String(COMPLEMENT)}`,
    ]);
    expect(refunds.amounts).toEqual([
      {
        paymentId: "pay_2",
        amountCents: COMPLEMENT,
        nature: "adjustment",
        reason: "late_payment",
        requestedBy: null,
      },
    ]);
    expect(refunds.remainders).toEqual([]);
    expect(journal.types()).toEqual([]);
    expect(notifier.notices).toEqual([]);
  });

  it("reste nul : rien demandé, le journal le dit (l'annulation a tout rendu)", async () => {
    const { late, refunds, journal, notifier } = scene(0, "closed");

    await late.handle(delivery(lateFact()));

    expect(refunds.amounts).toEqual([]);
    expect(journal.types()).toEqual(["order.card_increase_already_returned"]);
    expect(notifier.notices).toEqual([]);
  });

  it("reste partiel : le reste demandé, et la cloche « rendu en partie ailleurs »", async () => {
    const { late, refunds, notifier } = scene(500, "closed");

    await late.handle(delivery(lateFact()));

    expect(refunds.amounts.map((request) => request.amountCents)).toEqual([500]);
    expect(notifier.notices.map((notice) => notice.kind)).toEqual([
      "order.card_increase_partly_returned",
    ]);
  });
});

describe("RefundRefusedIncrease — la hausse payée qui ne s'applique plus", () => {
  it("rend le complément (`revision_refused`), puis prévient l'auteur, clé déterministe sans adresse", async () => {
    const { refused, refunds, mail } = scene(COMPLEMENT, "refused");

    await refused.handle(delivery(refusedFact()));

    expect(refunds.amounts).toEqual([
      expect.objectContaining({
        amountCents: COMPLEMENT,
        nature: "adjustment",
        reason: "revision_refused",
      }),
    ]);
    expect(mail.queued).toHaveLength(1);
    expect(mail.queued[0]).toMatchObject({
      template: "customer.order-modification-failed",
      to: "lea@example.test",
      idempotencyKey: "card-increase-refused:prop_1",
      subjects: [{ type: "order", id: "ord_1" }],
      data: { complementCents: COMPLEMENT },
    });
  });

  it("reste nul : le journal le dit, et le client est prévenu quand même", async () => {
    const { refused, refunds, journal, mail } = scene(0, "refused");

    await refused.handle(delivery(refusedFact()));

    expect(refunds.amounts).toEqual([]);
    expect(journal.types()).toEqual(["order.card_increase_already_returned"]);
    expect(mail.queued).toHaveLength(1);
  });

  it("reste partiel : le reste demandé, la cloche", async () => {
    const { refused, refunds, notifier } = scene(700, "refused");

    await refused.handle(delivery(refusedFact()));

    expect(refunds.amounts.map((request) => request.amountCents)).toEqual([700]);
    expect(notifier.notices).toHaveLength(1);
  });
});
