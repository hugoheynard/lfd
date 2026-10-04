import { UnitOfWork } from "../../database/unit-of-work.js";
import type { DurableDelivery } from "../durable-event.js";
import {
  DurableSubscribers,
  type DurableSubscriber,
  type RegisteredSubscriber,
} from "../durable-handler.js";
import type { OutboxDelivery } from "../outbox-delivery.js";
import { OutboxDeliveryRepository } from "../outbox-delivery.repository.js";
import { OutboxRelayTrigger } from "../outbox-relay-trigger.js";
import {
  OutboxRelayStore,
  type ClaimRequest,
  type ClaimedDelivery,
  type DeliveryFailure,
} from "../outbox-relay-store.js";

/** Une livraison en mémoire, avec ce que le relais en a fait. */
export interface StoredDelivery {
  readonly claimed: ClaimedDelivery;
  nextAttemptAt: Date;
  attempts: number;
  claimedUntil: Date | null;
  deliveredAt: Date | null;
  lastError: string | null;
}

/** Le relais côté base, en mémoire — mêmes conditions que l'adaptateur. */
export class InMemoryRelayStore extends OutboxRelayStore {
  readonly rows: StoredDelivery[] = [];

  add(claimed: Omit<ClaimedDelivery, "attempts">, nextAttemptAt: Date, attempts = 0): void {
    this.rows.push({
      claimed: { ...claimed, attempts },
      nextAttemptAt,
      attempts,
      claimedUntil: null,
      deliveredAt: null,
      lastError: null,
    });
  }

  claim(request: ClaimRequest): Promise<readonly ClaimedDelivery[]> {
    const due = this.rows
      .filter(
        (row) =>
          row.deliveredAt === null &&
          row.attempts < request.maxAttempts &&
          row.nextAttemptAt <= request.now &&
          (row.claimedUntil === null || row.claimedUntil < request.now),
      )
      .slice(0, request.limit);
    for (const row of due) {
      row.claimedUntil = request.leaseUntil;
    }
    return Promise.resolve(due.map((row) => ({ ...row.claimed, attempts: row.attempts })));
  }

  acknowledge(eventId: string, subscriber: string, at: Date): Promise<boolean> {
    const row = this.find(eventId, subscriber);
    if (row === undefined || row.deliveredAt !== null) {
      return Promise.resolve(false);
    }
    row.deliveredAt = at;
    row.claimedUntil = null;
    return Promise.resolve(true);
  }

  recordFailure(failure: DeliveryFailure): Promise<void> {
    const row = this.find(failure.eventId, failure.subscriber);
    if (row !== undefined && row.deliveredAt === null) {
      row.attempts = failure.attempts;
      row.nextAttemptAt = failure.nextAttemptAt;
      row.lastError = failure.error;
      row.claimedUntil = null;
    }
    return Promise.resolve();
  }

  /** L'état de chaque ligne, pour qu'une unité de travail annulée le rende. */
  snapshot(): () => void {
    const saved = this.rows.map((row) => ({ ...row }));
    return () => {
      this.rows.splice(0, this.rows.length, ...saved);
    };
  }

  find(eventId: string, subscriber: string): StoredDelivery | undefined {
    return this.rows.find(
      (row) => row.claimed.eventId === eventId && row.claimed.subscriber === subscriber,
    );
  }
}

/** Un abonné qui compte ce qu'il reçoit, et échoue tant qu'on le lui demande. */
export class CountingSubscriber implements DurableSubscriber {
  readonly received: DurableDelivery[] = [];
  failuresLeft = 0;

  handle(delivery: DurableDelivery): Promise<void> {
    if (this.failuresLeft > 0) {
      this.failuresLeft -= 1;
      return Promise.reject(new TypeError("abonné en panne"));
    }
    this.received.push(delivery);
    return Promise.resolve();
  }
}

/** Le registre, posé à la main. */
export class StaticSubscribers extends DurableSubscribers {
  constructor(private readonly byType: Readonly<Record<string, readonly RegisteredSubscriber[]>>) {
    super();
  }

  subscribersOf(type: string): readonly RegisteredSubscriber[] {
    return this.byType[type] ?? [];
  }
}

export class CountingTrigger extends OutboxRelayTrigger {
  wakes = 0;

  wake(): void {
    this.wakes += 1;
  }
}

export class InMemoryDeliveryRepository extends OutboxDeliveryRepository {
  saved: OutboxDelivery[] = [];

  constructor(private readonly stored: OutboxDelivery | null) {
    super();
  }

  load(): Promise<OutboxDelivery | null> {
    return Promise.resolve(this.stored);
  }

  save(delivery: OutboxDelivery): Promise<void> {
    this.saved.push(delivery);
    return Promise.resolve();
  }
}

/**
 * Une unité de travail qui ANNULE : `DirectUnitOfWork` ne défait rien, et la
 * garde repose précisément sur ce que la base défait — un reçu posé avant un
 * abonné qui échoue doit disparaître avec lui.
 */
export class RollbackUnitOfWork extends UnitOfWork {
  constructor(private readonly store: InMemoryRelayStore) {
    super();
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    const restore = this.store.snapshot();
    try {
      return await work();
    } catch (cause) {
      restore();
      throw cause;
    }
  }
}
