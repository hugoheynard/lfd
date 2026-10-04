import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../database/unit-of-work.js";
import type { RegisteredSubscriber } from "./durable-handler.js";
import type { ClaimedDelivery } from "./outbox-relay-store.js";
import { OutboxRelayStore } from "./outbox-relay-store.js";

/**
 * La **garde commune** d'un abonné durable (plan §7) : elle ouvre l'unité de
 * travail, y pose le reçu, et n'appelle l'abonné que si le reçu est neuf. Reçu
 * et effet partent ensemble, ou rien ne part — une seconde livraison du même
 * fait est donc sans effet. L'abonné ne s'en charge pas.
 */
@Injectable()
export class DurableDeliveryGuard {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly store: OutboxRelayStore,
  ) {}

  /** @returns `false` si la livraison était déjà faite (doublon sauté). */
  deliver(claimed: ClaimedDelivery, subscriber: RegisteredSubscriber, at: Date): Promise<boolean> {
    return this.unitOfWork.run(async () => {
      const fresh = await this.store.acknowledge(claimed.eventId, subscriber.name, at);
      if (!fresh) {
        return false;
      }
      await subscriber.handler.handle({
        eventId: claimed.eventId,
        type: claimed.type,
        payload: claimed.payload,
      });
      return true;
    });
  }
}
