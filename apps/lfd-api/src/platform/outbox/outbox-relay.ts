import { Injectable } from "@nestjs/common";

import { BackgroundWork } from "../events/background-work.js";
import { Clock } from "../time/clock.js";
import { DurableDeliveryGuard } from "./durable-delivery-guard.js";
import { DurableSubscribers } from "./durable-handler.js";
import { OutboxRelayStore, type ClaimedDelivery } from "./outbox-relay-store.js";
import { OutboxRelayTrigger } from "./outbox-relay-trigger.js";
import { MAX_DELIVERY_ATTEMPTS, nextAttemptAt } from "./retry-policy.js";

/** Livraisons réservées par tour. */
const BATCH_SIZE = 20;
/** Tours au plus par passage : un passage ne tourne pas indéfiniment. */
const MAX_ROUNDS = 10;
/** Bail d'une réservation : un relais mort le laisse expirer, la ligne revient. */
const LEASE_MS = 60_000;
/** Longueur gardée d'une erreur : un témoin, pas une pile entière. */
const MAX_ERROR_LENGTH = 1000;

/** Le compte rendu d'un passage — la seule observabilité d'un cron. */
export interface OutboxSweepReport {
  readonly delivered: number;
  readonly skipped: number;
  readonly failed: number;
}

/**
 * Le **relais** de la boîte d'envoi (plan §7) : réserver, puis livrer chaque
 * livraison dans SA unité de travail, par la garde commune. Aucun verrou n'est
 * tenu pendant qu'un abonné travaille.
 *
 * Deux déclencheurs : `wake()` après la validation d'un fait (chemin rapide,
 * inscrit à `BackgroundWork` pour que `drain()` l'attende), et le balayage
 * appelé par le cron (`POST /admin/outbox/sweep`), qui rattrape ce qu'un
 * processus endormi ou mort a laissé.
 */
@Injectable()
export class OutboxRelay extends OutboxRelayTrigger {
  constructor(
    private readonly store: OutboxRelayStore,
    private readonly subscribers: DurableSubscribers,
    private readonly guard: DurableDeliveryGuard,
    private readonly clock: Clock,
    private readonly work: BackgroundWork,
  ) {
    super();
  }

  wake(): void {
    void this.work.track(
      this.sweep().then(() => undefined),
      "outbox.relay",
    );
  }

  async sweep(): Promise<OutboxSweepReport> {
    const report = { delivered: 0, skipped: 0, failed: 0 };
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const now = this.clock.now();
      const batch = await this.store.claim({
        now,
        leaseUntil: new Date(now.getTime() + LEASE_MS),
        limit: BATCH_SIZE,
        maxAttempts: MAX_DELIVERY_ATTEMPTS,
      });
      for (const claimed of batch) {
        report[await this.deliverOne(claimed)] += 1;
      }
      if (batch.length < BATCH_SIZE) {
        break;
      }
    }
    return report;
  }

  private async deliverOne(claimed: ClaimedDelivery): Promise<keyof OutboxSweepReport> {
    const now = this.clock.now();
    const subscriber = this.subscribers
      .subscribersOf(claimed.type)
      .find((candidate) => candidate.name === claimed.subscriber);
    if (subscriber === undefined) {
      // Un abonné retiré du code laisse ses livraisons en attente : elles
      // échouent jusqu'à la lettre morte, visibles, plutôt que de disparaître.
      return this.fail(claimed, now, `L'abonné « ${claimed.subscriber} » n'est plus inscrit.`);
    }
    try {
      return (await this.guard.deliver(claimed, subscriber, now)) ? "delivered" : "skipped";
    } catch (cause) {
      return this.fail(claimed, now, describe(cause));
    }
  }

  private async fail(claimed: ClaimedDelivery, now: Date, error: string): Promise<"failed"> {
    const attempts = claimed.attempts + 1;
    await this.store.recordFailure({
      eventId: claimed.eventId,
      subscriber: claimed.subscriber,
      attempts,
      nextAttemptAt: nextAttemptAt(attempts, now),
      error: error.slice(0, MAX_ERROR_LENGTH),
    });
    return "failed";
  }
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
