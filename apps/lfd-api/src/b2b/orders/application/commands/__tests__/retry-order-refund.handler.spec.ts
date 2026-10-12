import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedWallClock } from "../../../../../platform/time/fixed-wall-clock.js";
import type { OrderRefundState } from "../../../domain/entities/order-refund.js";
import {
  RefundRequestAlreadyRefundedError,
  RefundRequestAwaitingBankError,
  RefundRequestInProgressError,
  RefundRequestNotFoundError,
} from "../../../domain/errors/order-refund-request-errors.js";
import { RetryOrderRefundCommand } from "../retry-order-refund.command.js";
import { RetryOrderRefundHandler } from "../retry-order-refund.handler.js";
import {
  InMemoryLedgers,
  InMemoryRefundRequests,
  ORDER_ID,
  RecordingDispatch,
  RefundStore,
} from "./refund-doubles.js";

/**
 * « Relancer le remboursement » (plan `order/plan-annulation-de-commande.md`,
 * C4.7 (c), C4.9) : jamais Stripe dans la requête. Instants comparés entre eux.
 */
const START = new Date(Date.UTC(2030, 0, 10, 9));
const LATER = new Date(Date.UTC(2030, 0, 10, 10));

function refund(status: OrderRefundState["status"]): OrderRefundState {
  return {
    id: "ref_1",
    stripeRefundId: "re_1",
    amountCents: 2_340,
    currency: "eur",
    status,
    refundedAt: START,
    recordedAt: START,
    updatedAt: START,
    creditNoteId: null,
  };
}

function build() {
  const store = new RefundStore();
  const dispatch = new RecordingDispatch();
  const handler = new RetryOrderRefundHandler(
    new InMemoryLedgers(store),
    new InMemoryRefundRequests(store),
    dispatch,
    new DirectUnitOfWork(),
    new FixedWallClock(LATER),
  );
  const run = () => handler.execute(new RetryOrderRefundCommand(ORDER_ID));
  return { store, dispatch, run };
}

describe("RetryOrderRefundHandler", () => {
  it("à émettre après des échecs : due maintenant (horloge murale), exécuteur lancé après validation", async () => {
    const { store, dispatch, run } = build();
    store.seedRequest(START, {
      attempts: 3,
      round: 4,
      lastFailure: "declined:x",
      nextAttemptAt: null,
    });

    await run();

    expect(store.request?.nextAttemptAt).toEqual(LATER);
    expect(store.request?.generation).toBe(1);
    expect(dispatch.dispatched).toEqual([ORDER_ID]);
  });

  it("échoué chez Stripe : relancé — c'est l'exécuteur, sous son bail, qui ouvre la génération", async () => {
    const { store, dispatch, run } = build();
    store.seedRequest(START, { stripeRefundId: "re_1", issuedAt: START });
    store.refunds = [refund("failed")];

    await run();

    expect(store.request?.generation).toBe(1);
    expect(dispatch.dispatched).toEqual([ORDER_ID]);
  });

  it.each<[string, (store: RefundStore) => void, new (...args: never[]) => Error]>([
    ["pas de demande", () => undefined, RefundRequestNotFoundError],
    [
      "déjà remboursée",
      (store) => {
        store.seedRequest(START, { stripeRefundId: "re_1", issuedAt: START });
        store.refunds = [refund("succeeded")];
      },
      RefundRequestAlreadyRefundedError,
    ],
    [
      "émise, en attente de la banque",
      (store) => {
        store.seedRequest(START, { stripeRefundId: "re_1", issuedAt: START });
        store.refunds = [refund("pending")];
      },
      RefundRequestAwaitingBankError,
    ],
    [
      "un exécuteur tient le bail",
      (store) => {
        store.seedRequest(START, {
          claimToken: "tok",
          claimedUntil: new Date(LATER.getTime() + 1),
        });
      },
      RefundRequestInProgressError,
    ],
  ])("refuse : %s, sans rien lancer", async (_, seed, error) => {
    const { store, dispatch, run } = build();
    seed(store);

    await expect(run()).rejects.toBeInstanceOf(error);
    expect(dispatch.dispatched).toEqual([]);
  });

  it("un bail ÉCHU ne refuse pas : la demande est relancée", async () => {
    const { store, dispatch, run } = build();
    store.seedRequest(START, { claimToken: "mort", claimedUntil: START });

    await run();

    expect(dispatch.dispatched).toEqual([ORDER_ID]);
  });
});
