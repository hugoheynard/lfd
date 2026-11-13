import type { CardPaymentLine } from "../../../../../card-payment/channels/requests/index.js";
import { UnitOfWork } from "../../../../../platform/database/unit-of-work.js";
import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import { RecordingJournal } from "../../../../../platform/journal/__tests__/recording-journal.js";
import { DurableDeliveryGuard } from "../../../../../platform/outbox/durable-delivery-guard.js";
import { OutboxRelay } from "../../../../../platform/outbox/outbox-relay.js";
import {
  InMemoryRelayStore,
  StaticSubscribers,
} from "../../../../../platform/outbox/__tests__/outbox-doubles.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { ORDER_BILLING_SETTLED } from "../../../domain/events/order-billing-settled.fact.js";
import { OrderCardAdoption } from "../../../domain/ports/order-card-payments.js";
import { RefundablePayments } from "../../services/refundable-payments.js";
import { ShortfallRefundMoneyReader } from "../../services/shortfall-refund-money.js";
import { ShortfallRefunding } from "../../services/shortfall-refunding.js";
import {
  AppliedProposals,
  CardMoneyLedger,
  FixedShortfallRefundSubjects,
  LedgerCardRefunds,
  paidLine,
  refundSubject,
} from "../../services/__tests__/shortfall-refund-doubles.js";
import {
  REFUND_SHORTFALL_ON_BILLING_SETTLED,
  RefundShortfallOnBillingSettled,
} from "../refund-shortfall-on-billing-settled.handler.js";

/**
 * **Intégration par la VRAIE garde** (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 4.2 et § 9) :
 * le relais, `DurableDeliveryGuard`, l'abonné du reste et `ShortfallRefunding`
 * réels ; le bloc carte, l'adoption et la boîte d'envoi en mémoire, ANNULÉS
 * ensemble quand l'unité de travail lève — ce que fait la transaction du reçu.
 *
 * Un refus de phase 2 sur la SECONDE part : rien ne doit rester de la
 * première, ni l'adoption, ni le reçu ; l'essai est compté une fois.
 */

const NOW = new Date(1_800_000_000_000);
const EVENT_ID = "outbox_1";

/** Le premier paiement adopté — une écriture, annulée avec le reste. */
class RecordedAdoption extends OrderCardAdoption {
  readonly adopted: string[] = [];

  constructor(private readonly ledger: CardMoneyLedger) {
    super();
  }

  ensureFirst(orderId: string): Promise<CardPaymentLine | null> {
    this.adopted.push(orderId);
    return Promise.resolve(this.ledger.payments.find((line) => line.role === "first") ?? null);
  }
}

/** La transaction du reçu : le relais, le carnet et l'adoption reviennent ensemble à l'échec. */
class RollbackWorld extends UnitOfWork {
  constructor(
    private readonly store: InMemoryRelayStore,
    private readonly ledger: CardMoneyLedger,
    private readonly adoption: RecordedAdoption,
  ) {
    super();
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    const restoreStore = this.store.snapshot();
    const requests = [...this.ledger.requests];
    const adopted = [...this.adoption.adopted];
    try {
      return await work();
    } catch (cause) {
      restoreStore();
      this.ledger.requests.splice(0, this.ledger.requests.length, ...requests);
      this.adoption.adopted.splice(0, this.adoption.adopted.length, ...adopted);
      throw cause;
    }
  }
}

function world(failOn: number | null) {
  const store = new InMemoryRelayStore();
  const ledger = new CardMoneyLedger([
    paidLine("pay_1", 300),
    paidLine("pay_2", 400, { role: "complement" }),
  ]);
  const adoption = new RecordedAdoption(ledger);
  const refunds = new LedgerCardRefunds(ledger, [], failOn);
  const journal = new RecordingJournal();
  const refunding = new ShortfallRefunding(
    new FixedShortfallRefundSubjects(refundSubject({ billableTotalCents: 100 })),
    new ShortfallRefundMoneyReader(
      new RefundablePayments(adoption, new AppliedProposals(["pay_2"]), ledger),
      ledger,
    ),
    refunds,
    journal,
  );
  const subscribers = new StaticSubscribers({
    [ORDER_BILLING_SETTLED]: [
      {
        name: REFUND_SHORTFALL_ON_BILLING_SETTLED,
        handler: new RefundShortfallOnBillingSettled(refunding),
      },
    ],
  });
  const guard = new DurableDeliveryGuard(new RollbackWorld(store, ledger, adoption), store);
  const relay = new OutboxRelay(
    store,
    subscribers,
    guard,
    new FixedClock(NOW),
    new BackgroundWork(),
  );
  store.add(
    {
      eventId: EVENT_ID,
      subscriber: REFUND_SHORTFALL_ON_BILLING_SETTLED,
      type: ORDER_BILLING_SETTLED,
      payload: {
        orderId: "ord_1",
        write: "closed",
        billableTotalCents: 100,
        settledOn: "2030-01-10",
      },
    },
    NOW,
  );
  return { store, ledger, adoption, refunds, journal, relay };
}

describe("le reste au solde, par la vraie garde de la boîte d'envoi", () => {
  it("un refus sur la seconde part : ni demande, ni adoption, ni reçu ; un essai compté", async () => {
    const scene = world(2);

    await expect(scene.relay.sweep()).resolves.toEqual({ delivered: 0, skipped: 0, failed: 1 });

    expect(scene.ledger.requests).toEqual([]);
    expect(scene.adoption.adopted).toEqual([]);
    expect(scene.journal.facts).toEqual([]);
    expect(scene.store.find(EVENT_ID, REFUND_SHORTFALL_ON_BILLING_SETTLED)).toMatchObject({
      attempts: 1,
      deliveredAt: null,
      lastError: "refus du bloc carte, forcé",
    });
  });

  it("sans refus, les deux parts, l'adoption et le reçu partent ensemble", async () => {
    const scene = world(null);

    await expect(scene.relay.sweep()).resolves.toEqual({ delivered: 1, skipped: 0, failed: 0 });

    // 700 encaissés − 100 facturables = 600 : le complément (400) d'abord, puis 200 sur le premier.
    expect(
      scene.ledger.requests.map((request) => [request.paymentId, request.announcedCents]),
    ).toEqual([
      ["pay_2", 400],
      ["pay_1", 200],
    ]);
    expect(scene.adoption.adopted).toEqual(["ord_1"]);
    expect(scene.store.find(EVENT_ID, REFUND_SHORTFALL_ON_BILLING_SETTLED)?.deliveredAt).toEqual(
      NOW,
    );
  });
});
