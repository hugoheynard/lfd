import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  RECURRING_OCCURRENCE_MISSED,
  RECURRING_OCCURRENCE_REFUSED,
  RecurringOccurrenceFact,
} from "../../../channels/commerce/occurrence-facts.js";
import { OccurrenceIssueBell } from "../services/occurrence-issue-bell.js";

export const RING_ON_OCCURRENCE_REFUSED = "recurring.issue-bell.on-occurrence-refused";
export const RING_ON_OCCURRENCE_MISSED = "recurring.issue-bell.on-occurrence-missed";

/** Une échéance refusée pour une cause nouvelle sonne la cloche du staff. */
@Injectable()
@DurableHandler({ type: RECURRING_OCCURRENCE_REFUSED, subscriber: RING_ON_OCCURRENCE_REFUSED })
export class RingOnOccurrenceRefused implements DurableSubscriber {
  constructor(
    private readonly bell: OccurrenceIssueBell,
    private readonly clock: Clock,
  ) {}

  handle(delivery: DurableDelivery): Promise<void> {
    return this.bell.ring(RecurringOccurrenceFact.fromDelivery(delivery), this.clock.now());
  }
}

/** Une échéance manquée — l'heure limite passée sans commande — sonne aussi. */
@Injectable()
@DurableHandler({ type: RECURRING_OCCURRENCE_MISSED, subscriber: RING_ON_OCCURRENCE_MISSED })
export class RingOnOccurrenceMissed implements DurableSubscriber {
  constructor(
    private readonly bell: OccurrenceIssueBell,
    private readonly clock: Clock,
  ) {}

  handle(delivery: DurableDelivery): Promise<void> {
    return this.bell.ring(RecurringOccurrenceFact.fromDelivery(delivery), this.clock.now());
  }
}
