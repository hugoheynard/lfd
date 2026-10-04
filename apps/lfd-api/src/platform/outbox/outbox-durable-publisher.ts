import { Injectable } from "@nestjs/common";

import { AfterCommit } from "../database/after-commit.js";
import type { DurableFact } from "./durable-event.js";
import { DurablePublisher } from "./durable-publisher.js";
import { Outbox } from "./outbox.js";
import { OutboxRelayTrigger } from "./outbox-relay-trigger.js";

/**
 * La ligne d'abord, dans la transaction ; le relais ensuite, APRÈS la
 * validation (chemin rapide). S'il ne part pas, le balayage du cron rattrape.
 */
@Injectable()
export class OutboxDurablePublisher extends DurablePublisher {
  constructor(
    private readonly outbox: Outbox,
    private readonly afterCommit: AfterCommit,
    private readonly relay: OutboxRelayTrigger,
  ) {
    super();
  }

  async publish(fact: DurableFact): Promise<void> {
    await this.outbox.append(fact);
    this.afterCommit.defer(() => {
      this.relay.wake();
    }, "outbox.relay");
  }
}
