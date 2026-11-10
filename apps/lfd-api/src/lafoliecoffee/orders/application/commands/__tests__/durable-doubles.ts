import type { DurableFact } from "../../../../../platform/outbox/durable-event.js";
import { DurablePublisher } from "../../../../../platform/outbox/durable-publisher.js";

/** La boîte d'envoi des passations, enregistrée : quels faits, dans quel ordre. */
export class RecordingDurable extends DurablePublisher {
  readonly facts: DurableFact[] = [];

  publish(fact: DurableFact): Promise<void> {
    this.facts.push(fact);
    return Promise.resolve();
  }
}
