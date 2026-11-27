import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { Clock } from "../../../../platform/time/clock.js";
import { PLANNED_COLUMN_MISSED, PlannedColumnIssueFact } from "../services/planned-column-facts.js";
import { PlannedColumnIssueBell } from "../services/planned-column-issue-bell.js";

export const RING_ON_PLANNED_COLUMN_MISSED = "recurring.planned-bell.on-column-missed";

/** Une colonne planifiée manquée — sa fermeture passée sans conversion — sonne aussi. */
@Injectable()
@DurableHandler({ type: PLANNED_COLUMN_MISSED, subscriber: RING_ON_PLANNED_COLUMN_MISSED })
export class RingOnPlannedColumnMissed implements DurableSubscriber {
  constructor(
    private readonly bell: PlannedColumnIssueBell,
    private readonly clock: Clock,
  ) {}

  handle(delivery: DurableDelivery): Promise<void> {
    return this.bell.ring(PlannedColumnIssueFact.fromDelivery(delivery), this.clock.now());
  }
}
