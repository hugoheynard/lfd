/** Le banc commun des specs du remboursement par carte (plan M2, lot P1.b). */
import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { RecordingJournal } from "../../../../platform/journal/__tests__/recording-journal.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { FixedWallClock } from "../../../../platform/time/fixed-wall-clock.js";
import { RegisteredSubjectSettlements } from "../../../channels/subjects/index.js";
import { CardPayment } from "../../../domain/entities/card-payment.js";
import {
  CardRefundRequest,
  type CardRefundRequestIntent,
} from "../../../domain/entities/card-refund-request.js";
import type { CardRefundLine } from "../../../domain/entities/card-refund-ledger.js";
import type { CardPaymentState } from "../../../domain/value-objects/card-payment-state.js";
import { PaymentAccount } from "../../../domain/value-objects/payment-account.js";
import { PaymentSubject } from "../../../domain/value-objects/payment-subject.js";
import {
  InMemoryCardPayments,
  RecordingCardProvider,
  RecordingDurable,
  StaticCardProviders,
  TestSubjectSettlement,
  Timeline,
} from "../../__tests__/card-payment-doubles.js";
import { IssueCardRefundHandler } from "../../commands/issue-card-refund.handler.js";
import { ProviderPaymentResolver } from "../../provider-payment-resolver.js";
import { BlockCardRefunds } from "../block-card-refunds.js";
import { CardRefundBell } from "../card-refund-bell.js";
import { CardRefundEffectsWriter } from "../card-refund-effects.js";
import { CardRefundIssuancePreparation } from "../card-refund-issuance-preparation.js";
import { CardRefundIssuanceRecorder } from "../card-refund-issuance-recorder.js";
import { CardRefundObservation } from "../card-refund-observation.js";
import { CardRefundOutcomes } from "../card-refund-outcomes.js";
import { CardRefundRetrier } from "../card-refund-retrier.js";
import { CardRefundScope } from "../card-refund-scope.js";
import {
  RecordingDispatch,
  RecordingNotifier,
  RefundStore,
  StoreLease,
  StoreLedgers,
  StorePositions,
  StoreRequests,
  StoreSweep,
} from "./card-refund-doubles.js";

/** L'instant des horloges doublées — rien ne le compare à l'heure réelle. */
export const NOW = new Date("2030-01-10T09:00:00.000Z");
/** Le montant du paiement semé. */
export const CHARGED = 2_340;
export const ORDER = { type: "order", id: "ord_1" } as const;

export function refundHarness() {
  const timeline = new Timeline();
  const payments = new InMemoryCardPayments(timeline);
  const store = new RefundStore(payments, timeline);
  const provider = new RecordingCardProvider();
  const providers = new StaticCardProviders(new Map([["lfc-stripe", provider]]));
  const settlement = new TestSubjectSettlement(timeline, "order");
  const settlements = new RegisteredSubjectSettlements([settlement]);
  const durable = new RecordingDurable(timeline);
  const journal = new RecordingJournal();
  const notifier = new RecordingNotifier();
  const clock = new FixedClock(NOW);
  const wall = new FixedWallClock(NOW);
  const ids = new FixedIdGenerator("id");
  const uow = new DirectUnitOfWork();
  const ledgers = new StoreLedgers(store);
  const requests = new StoreRequests(store);
  const positions = new StorePositions(store);
  const dispatch = new RecordingDispatch();
  const scope = new CardRefundScope(ledgers, settlements);
  const effects = new CardRefundEffectsWriter(
    journal,
    new CardRefundBell(notifier, clock),
    new CardRefundOutcomes(positions, durable),
  );
  const retrier = new CardRefundRetrier(scope, requests, effects, dispatch, wall, uow);
  const refunds = new BlockCardRefunds(scope, requests, positions, retrier, dispatch, ids, clock);
  const resolver = new ProviderPaymentResolver(
    payments,
    settlements,
    new FixedIdGenerator("pay"),
    clock,
  );
  const observation = new CardRefundObservation(
    resolver,
    scope,
    requests,
    ledgers,
    refunds,
    effects,
    ids,
    clock,
    uow,
  );
  const preparation = new CardRefundIssuancePreparation(scope, requests, effects, clock, uow);
  const recorder = new CardRefundIssuanceRecorder(
    scope,
    requests,
    ledgers,
    effects,
    ids,
    clock,
    wall,
    uow,
  );
  const issuer = new IssueCardRefundHandler(
    new StoreLease(store),
    preparation,
    recorder,
    providers,
    new FixedIdGenerator("token"),
    wall,
  );
  return {
    timeline,
    payments,
    store,
    provider,
    providers,
    settlement,
    settlements,
    durable,
    journal,
    notifier,
    clock,
    wall,
    uow,
    requests,
    ledgers,
    positions,
    dispatch,
    scope,
    effects,
    retrier,
    refunds,
    resolver,
    observation,
    preparation,
    recorder,
    issuer,
    sweep: new StoreSweep(store),
  };
}

export type RefundHarness = ReturnType<typeof refundHarness>;

/** Un paiement de `ord_1`, sur `pi_1`, dans l'état voulu — encaissé par défaut. */
export function seedPayment(
  h: RefundHarness,
  state: CardPaymentState = "paid",
  overrides: {
    readonly id?: string;
    readonly providerRef?: string;
    readonly amountCents?: number;
  } = {},
): CardPayment {
  const payment = CardPayment.adopt(
    {
      id: overrides.id ?? "pay_1",
      subject: PaymentSubject.of(ORDER.type, ORDER.id),
      account: PaymentAccount.of("lfc-stripe"),
      providerRef: overrides.providerRef ?? "pi_1",
      role: "first",
      amountCents: overrides.amountCents ?? CHARGED,
      at: NOW,
    },
    state,
  );
  h.payments.seed(payment);
  return payment;
}

/** Une demande écrite telle quelle, sur `pay_1` par défaut. */
export function seedRequest(
  h: RefundHarness,
  overrides: Partial<CardRefundRequestIntent> = {},
): CardRefundRequest {
  const request = CardRefundRequest.request({
    id: "req_1",
    paymentId: "pay_1",
    form: "remainder",
    amountCents: null,
    nature: "return",
    reason: "cancellation",
    announcedCents: CHARGED,
    requestedAt: NOW,
    requestedBy: null,
    firstAttemptAt: NOW,
    ...overrides,
  });
  h.store.seedRequest(request.toPersistence().state);
  return request;
}

/** Une ligne du carnet posée telle quelle. */
export function seedLine(h: RefundHarness, line: Partial<CardRefundLine> = {}): void {
  const full: CardRefundLine = {
    id: "ref_seed",
    requestId: null,
    nature: null,
    source: "provider",
    providerRef: "re_seed",
    amountCents: CHARGED,
    currency: "eur",
    status: "succeeded",
    refundedAt: NOW,
    recordedAt: NOW,
    updatedAt: NOW,
    ...line,
  };
  h.store.lines.set("pay_1", [...h.store.linesOf("pay_1"), full]);
}
