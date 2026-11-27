import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  PLANNED_COLUMN_REFUSED,
  PlannedColumnIssueFact,
} from "../services/planned-column-facts.js";
import { PlannedColumnIssueBell } from "../services/planned-column-issue-bell.js";

export const RING_ON_PLANNED_COLUMN_REFUSED = "recurring.planned-bell.on-column-refused";

/** Une colonne planifiée refusée par la passation sonne la cloche du staff. */
@Injectable()
@DurableHandler({ type: PLANNED_COLUMN_REFUSED, subscriber: RING_ON_PLANNED_COLUMN_REFUSED })
export class RingOnPlannedColumnRefused implements DurableSubscriber {
  constructor(
    private readonly bell: PlannedColumnIssueBell,
    private readonly clock: Clock,
  ) {}

  handle(delivery: DurableDelivery): Promise<void> {
    return this.bell.ring(PlannedColumnIssueFact.fromDelivery(delivery), this.clock.now());
  }
}
