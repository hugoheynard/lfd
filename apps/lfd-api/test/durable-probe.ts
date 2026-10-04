import { Injectable, Module } from "@nestjs/common";

import type {
  DurableDelivery,
  DurableEvent,
  DurableFact,
} from "../src/platform/outbox/durable-event.js";
import { DurableHandler, type DurableSubscriber } from "../src/platform/outbox/durable-handler.js";

/** Le type du fait de sonde — aucun émetteur métier ne l'écrit. */
export const PROBE_TYPE = "test.probe_happened";
export const PROBE_SUBSCRIBER = "test.probe-counter";

/** Un fait durable de test, à clé déterministe. */
export class ProbeHappened implements DurableEvent {
  constructor(readonly probeId: string) {}

  durableFact(): DurableFact {
    return {
      type: PROBE_TYPE,
      key: `${PROBE_TYPE}:${this.probeId}`,
      payload: { probeId: this.probeId },
    };
  }
}

/**
 * L'abonné de sonde : il compte ce qu'il reçoit, et échoue tant qu'on le lui
 * demande. Le compte est l'« effet » observé — un effet par fait, pas plus.
 */
@Injectable()
@DurableHandler({ type: PROBE_TYPE, subscriber: PROBE_SUBSCRIBER })
export class ProbeCounter implements DurableSubscriber {
  readonly received: string[] = [];
  failuresLeft = 0;

  handle(delivery: DurableDelivery): Promise<void> {
    if (this.failuresLeft > 0) {
      this.failuresLeft -= 1;
      return Promise.reject(new TypeError("sonde en panne"));
    }
    this.received.push(delivery.eventId);
    return Promise.resolve();
  }

  reset(): void {
    this.received.length = 0;
    this.failuresLeft = 0;
  }
}

@Module({ providers: [ProbeCounter] })
export class DurableProbeModule {}
