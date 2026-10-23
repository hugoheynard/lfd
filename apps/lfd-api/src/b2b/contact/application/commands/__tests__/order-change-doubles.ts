import type {
  CustomerAudience,
  OrderChangeRequestStatusView,
  OrderRevisionQuoteView,
  PublicRequestReasonView,
  RequestKind,
  RequestReasonView,
} from "@lfd/contracts";

import { BusinessError } from "../../../../../platform/shared/errors/app-error.js";
import type { RequestedOrderChange } from "../../../domain/customer-request-details.js";
import {
  type ChangeableOrder,
  ChangeableOrderReader,
} from "../../../domain/ports/changeable-order.reader.js";
import {
  type AppliedOrderChange,
  OrderChangeApplier,
} from "../../../domain/ports/order-change.applier.js";
import { OrderChangeQuoter } from "../../../domain/ports/order-change.quoter.js";
import { OrderChangeRequestReader } from "../../../domain/ports/order-change-request.reader.js";
import { RequestReasonReader } from "../../../domain/ports/request-reason.reader.js";
import type { RequestReason } from "../../../domain/request-reason.js";

/** Les commandes que ce client voit, avec ce que la règle de la modification en dit. */
export class ChangeableOrders extends ChangeableOrderReader {
  constructor(private readonly visible: Readonly<Record<string, ChangeableOrder>>) {
    super();
  }

  visibleTo(orderId: string): Promise<ChangeableOrder | null> {
    return Promise.resolve(this.visible[orderId] ?? null);
  }
}

/** Les commandes dont une demande attend déjà notre réponse. */
export class PendingChanges extends OrderChangeRequestReader {
  constructor(private readonly pending: readonly string[] = []) {
    super();
  }

  latestFor(): Promise<OrderChangeRequestStatusView | null> {
    return Promise.resolve(null);
  }

  hasPending(orderId: string): Promise<boolean> {
    return Promise.resolve(this.pending.includes(orderId));
  }
}

/** Les motifs proposés, tirés des motifs connus — par rang, comme l'adaptateur. */
export class OfferedReasons extends RequestReasonReader {
  constructor(private readonly reasons: readonly RequestReason[]) {
    super();
  }

  list(): Promise<RequestReasonView[]> {
    return Promise.resolve([]);
  }

  offered(kind: RequestKind, audience: CustomerAudience): Promise<PublicRequestReasonView[]> {
    return Promise.resolve(
      this.reasons
        .filter((reason) => reason.isOfferedFor(kind, audience))
        .map((reason) => ({ id: reason.id, label: { fr: reason.labelFr, en: "", it: "" } })),
    );
  }
}

/** Un refus de la révision, tel que la commande le lèverait (inscrite, modifiée ailleurs…). */
export class RevisionRefused extends BusinessError {
  constructor() {
    super("orders.revise.inscribed", "La commande est déjà en préparation.");
  }
}

/** Les totaux que la révision doublée rend : 42,50 € après, 38,00 € avant. */
export const APPLIED_TOTAL_CENTS = 4250;
export const APPLIED_PREVIOUS_TOTAL_CENTS = 3800;

/** La révision, notée ; `refuse` la fait refuser comme la règle des commandes. */
export class RecordingApplier extends OrderChangeApplier {
  readonly applied: {
    readonly orderId: string;
    readonly staffUserId: string;
    readonly baseRevision: number;
    readonly change: RequestedOrderChange;
  }[] = [];

  constructor(
    private readonly log: string[] = [],
    private readonly refuse = false,
  ) {
    super();
  }

  apply(
    orderId: string,
    staffUserId: string,
    baseRevision: number,
    change: RequestedOrderChange,
  ): Promise<AppliedOrderChange> {
    this.log.push(`revise ${orderId}@${String(baseRevision)}`);
    if (this.refuse) {
      return Promise.reject(new RevisionRefused());
    }
    this.applied.push({ orderId, staffUserId, baseRevision, change });
    return Promise.resolve({
      revision: baseRevision + 1,
      totalCents: APPLIED_TOTAL_CENTS,
      previousTotalCents: APPLIED_PREVIOUS_TOTAL_CENTS,
    });
  }
}

/** Le devis de l'équipe, rendu tel quel ; note ce qu'on lui demande. */
export class FixedQuoter extends OrderChangeQuoter {
  readonly asked: string[] = [];

  constructor(private readonly view: OrderRevisionQuoteView) {
    super();
  }

  quote(orderId: string, staffUserId: string): Promise<OrderRevisionQuoteView> {
    this.asked.push(`${orderId} ${staffUserId}`);
    return Promise.resolve(this.view);
  }
}
