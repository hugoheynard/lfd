import { Injectable } from "@nestjs/common";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import type { NamedRef } from "../../domain/events/journal-names.js";
import {
  type GestureActor,
  SiteGestureFact,
  type SiteGestureType,
} from "../../domain/events/site-gesture.fact.js";
import { SitePrincipalLock } from "../../domain/ports/site-principal.lock.js";

/** Le geste à annoncer. */
export interface SiteGesture {
  readonly type: SiteGestureType;
  /** Le site, sous son nom du moment. */
  readonly site: NamedRef;
  /** L'objet du geste (l'adresse), par son identifiant. */
  readonly subjectId: string;
  readonly actor: GestureActor;
}

/**
 * **Écrit le fait durable d'un geste de site, principal figé**
 * (`plan-notifications-sous-comptes.md`, N4b). À appeler DANS l'unité de
 * travail de l'écriture : le principal est lu sous le verrou de la ligne du
 * site, et le fait part ou tombe avec l'écriture.
 *
 * Le fait est écrit même sans principal : c'est un fait du domaine, pas un
 * avis ; l'abonné de l'avis le laisse passer.
 */
@Injectable()
export class SiteGesturePublisher {
  constructor(
    private readonly principals: SitePrincipalLock,
    private readonly ids: IdGenerator,
    private readonly durable: DurablePublisher,
  ) {}

  async publish(gesture: SiteGesture): Promise<void> {
    const locked = await this.principals.lockedPrincipalOf(gesture.site.id);
    const fact = new SiteGestureFact(gesture.type, this.ids.next(), gesture.subjectId, {
      siteCompanyId: gesture.site.id,
      siteName: gesture.site.name,
      principalCompanyId: locked?.principalCompanyId ?? null,
      authorUserId: gesture.actor.kind === "customer" ? gesture.actor.userId : null,
      byTeam: gesture.actor.kind === "team",
    });
    await this.durable.publish(fact.durableFact());
  }
}
