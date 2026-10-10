import type { DurableFact } from "../../../../../platform/outbox/durable-event.js";
import { DurablePublisher } from "../../../../../platform/outbox/durable-publisher.js";
import { UuidGenerator } from "../../../../../platform/id/uuid-generator.js";

/** La boîte d'envoi du référentiel, enregistrée : quels faits, dans quel ordre. */
export class RecordingDurable extends DurablePublisher {
  readonly facts: DurableFact[] = [];

  publish(fact: DurableFact): Promise<void> {
    this.facts.push(fact);
    return Promise.resolve();
  }
}

/** Des identifiants de geste prévisibles : `geste_1`, `geste_2`, … */
export class CountingPimIds extends UuidGenerator {
  private counter = 0;

  next(): string {
    this.counter += 1;
    return `geste_${String(this.counter)}`;
  }
}
