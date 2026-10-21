import type { CustomerCancellationSettingsView } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { IntentCancellation } from "../../../../payments/domain/payment-gateway.js";
import type { OrderWithdrawalOutcome } from "../../../../../production/channels/commerce/index.js";
import type { CancellationSubject } from "../../../domain/ports/cancellation-subject.reader.js";
import type { CancellingPrincipal } from "../../../domain/ports/cancelling-member.reader.js";
import type { CustomerCancellationSubject } from "../../../domain/ports/customer-cancellation-subject.reader.js";
import { CancellationRefundRequester } from "../../services/cancellation-refund-requester.js";
import { CancellationRule } from "../../services/cancellation-rule.js";
import { CancellationWall } from "../../services/cancellation-wall.js";
import { CustomerCancellationPolicyGate } from "../../services/customer-cancellation-policy.js";
import { CustomerOrderCancellation } from "../../services/customer-order-cancellation.js";
import { GuestCancellationLinkResolver } from "../../services/guest-cancellation-link.resolver.js";
import { OrderCancellation } from "../../services/order-cancellation.service.js";
import { VoucherRestitutionRefusal } from "../../services/voucher-restitution-refusal.js";
import {
  cancellationSubject,
  FixedInscriptions,
  FixedSubjects,
  InMemoryCancellations,
  ScriptedCancelGateway,
  ScriptedDesk,
  ScriptedEngagements,
} from "./cancellation-doubles.js";
import {
  customerSubject,
  FixedCancellationSettings,
  FixedCustomerSubjects,
  FixedMembers,
  ReadableSigner,
} from "./customer-cancellation-doubles.js";
import { RecordingDurable } from "./durable-doubles.js";
import { InMemoryRefundRequests, RecordingDispatch, RefundStore } from "./refund-doubles.js";
import { RecordingRedemption, RETURNED } from "./voucher-doubles.js";

/**
 * La scène de l'annulation par un client : le VRAI noyau staff
 * (`OrderCancellation`) sur les doubles de l'annulation staff, et devant lui
 * le mur, le réglage et le lien d'invité. Rien n'est simulé entre le client
 * et le noyau : ce qu'on éprouve est ce qui tourne.
 */
export interface CustomerScene {
  readonly order?: Partial<CancellationSubject>;
  readonly customer?: Partial<CustomerCancellationSubject>;
  readonly settings?: Partial<CustomerCancellationSettingsView>;
  readonly members?: readonly string[];
  /** `user:company` → le principal par lequel le client atteint la commande d'un site. */
  readonly principals?: Readonly<Record<string, CancellingPrincipal>>;
  readonly stripe?: IntentCancellation;
  readonly desk?: OrderWithdrawalOutcome;
  readonly failures?: number;
  readonly now: Date;
}

export function customerScene(options: CustomerScene) {
  const trace: string[] = [];
  const order = cancellationSubject(options.order ?? {});
  const rows = new InMemoryCancellations(order, trace);
  rows.failures = options.failures ?? 0;
  const subjects = new FixedSubjects(order);
  const engagements = new ScriptedEngagements({ kind: "free" }, trace);
  const rule = new CancellationRule(engagements);
  const durable = new RecordingDurable();
  const refundStore = new RefundStore();
  const core = new OrderCancellation(
    subjects,
    rows,
    new ScriptedCancelGateway(options.stripe ?? { kind: "cancelled" }, trace),
    new ScriptedDesk(options.desk ?? "withdrawn", trace),
    new RecordingRedemption(false, RETURNED),
    new VoucherRestitutionRefusal(subjects, new FixedInscriptions(), rule),
    rule,
    engagements,
    new CancellationRefundRequester(
      new InMemoryRefundRequests(refundStore),
      new RecordingDispatch(),
    ),
    durable,
    new DirectUnitOfWork(),
    new FixedClock(options.now),
  );
  const settings = new FixedCancellationSettings(options.settings ?? {});
  const customers = new FixedCustomerSubjects(customerSubject(options.customer ?? {}));
  const signer = new ReadableSigner();
  return {
    trace,
    rows,
    durable,
    refundStore,
    settings,
    customers,
    signer,
    clock: new FixedClock(options.now),
    wall: new CancellationWall(new FixedMembers(options.members ?? [], options.principals ?? {})),
    links: new GuestCancellationLinkResolver(signer, customers),
    cancellation: new CustomerOrderCancellation(new CustomerCancellationPolicyGate(settings), core),
  };
}
