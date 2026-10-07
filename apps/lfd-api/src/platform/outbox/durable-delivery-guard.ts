import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../database/unit-of-work.js";
import type { RegisteredSubscriber } from "./durable-handler.js";
import type { ClaimedDelivery } from "./outbox-relay-store.js";
import { OutboxRelayStore } from "./outbox-relay-store.js";

/**
 * La **garde commune** d'un abonné durable (plan §7) : elle ouvre l'unité de
 * travail, y pose le reçu, et n'appelle l'abonné que si le reçu est neuf. Reçu
 * et écritures de l'abonné partent ensemble, ou rien ne part — une seconde
 * livraison du même fait est donc sans effet. L'abonné ne s'en charge pas.
 */
@Injectable()
export class DurableDeliveryGuard {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly store: OutboxRelayStore,
  ) {}

  /**
   * L'abonné tourne DANS la transaction du reçu, qui a un délai et tient une
   * connexion du pool le temps qu'elle dure (`UnitOfWork`). Un effet réseau —
   * courriel, poussée — ne s'y fait donc pas : il se diffère par
   * `deferUntilCommit` (le port `AfterCommit`, suivi par `BackgroundWork`) et
   * part après la validation, hors transaction, sans relance. Au 2026-10-07
   * (les seize abonnés relus), c'est ce que font « en route »
   * (`MailDeliveryEnRoute`) et le dossier du jour (`SendDossierOnDayClosed`,
   * `SendDossierOnDayRetaken`) — et déjà la livraison pour sa cloche et sa
   * localisation (`PlanArrestedBell`, `DeliveryStopsLocating`).
   *
   * @returns `false` si la livraison était déjà faite (doublon sauté).
   */
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
