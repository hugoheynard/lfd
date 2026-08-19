import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import {
  KbisCertificationRevokedEvent,
  KbisCertifiedEvent,
} from "../../../account/domain/events/kbis-certification.event.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";

/**
 * Abonnés du journal pour la **vérification du KBIS** — le geste qui ouvre (ou
 * referme) la porte d'activation.
 *
 * Idempotence par **instant** et non par société : contrairement à l'activation,
 * qui n'arrive qu'une fois, un extrait peut être vérifié, retiré, redéposé et
 * revérifié. Chacun de ces gestes est un fait distinct, et les écraser sous une
 * clé unique par société ferait disparaître exactement ce qu'on cherche à
 * garder : la suite des décisions.
 */
@EventsHandler(KbisCertifiedEvent)
export class OnKbisCertified implements IEventHandler<KbisCertifiedEvent> {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: KbisCertifiedEvent): void {
    // **Suivi** : cet abonné tourne hors de la requête HTTP. Sans cette
    // inscription, personne — ni la prod, ni un test — ne sait quand il a fini.
    void this.work.track(this.run(event), "on-kbis-certification");
  }

  private async run(event: KbisCertifiedEvent): Promise<void> {
    await this.recorder.record({
      type: ACTIVITY_TYPES.kbisCertified,
      subjectType: "company",
      subjectId: event.companyId,
      occurredAt: event.at,
      idempotencyKey: `${ACTIVITY_TYPES.kbisCertified}:${event.companyId}:${event.at.toISOString()}`,
      payload: { at: event.at.toISOString() },
    });
  }
}

@EventsHandler(KbisCertificationRevokedEvent)
export class OnKbisCertificationRevoked implements IEventHandler<KbisCertificationRevokedEvent> {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: KbisCertificationRevokedEvent): void {
    // **Suivi** : cet abonné tourne hors de la requête HTTP. Sans cette
    // inscription, personne — ni la prod, ni un test — ne sait quand il a fini.
    void this.work.track(this.run(event), "on-kbis-revoked");
  }

  private async run(event: KbisCertificationRevokedEvent): Promise<void> {
    await this.recorder.record({
      type: ACTIVITY_TYPES.kbisRevoked,
      subjectType: "company",
      subjectId: event.companyId,
      occurredAt: event.at,
      idempotencyKey: `${ACTIVITY_TYPES.kbisRevoked}:${event.companyId}:${event.at.toISOString()}`,
      // `suspended` répond à la question qu'on se posera en lisant la ligne :
      // est-ce que ça a coupé l'accès, ou le compte n'était-il pas encore actif ?
      payload: { at: event.at.toISOString(), suspended: event.suspended },
    });
  }
}
