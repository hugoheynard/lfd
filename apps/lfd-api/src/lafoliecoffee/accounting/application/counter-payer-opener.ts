import { Injectable } from "@nestjs/common";

import {
  CounterPayerOpening,
  type OpenedCounterPayer,
} from "../../account/domain/ports/counter-payer-opening.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { PayerCollectionMeansChangedEvent } from "../domain/events/collection-means.events.js";
import type { LegalEntitySubject } from "../domain/events/legal-entity.events.js";
import { BillingModeDatesReader } from "../domain/ports/billing-mode-dates.reader.js";
import { InvoiceIssuersReader } from "../domain/ports/invoice-issuers.reader.js";
import { PayerBillingModesReader } from "../domain/ports/payer-billing-modes.reader.js";
import { PayerChangeLock } from "../domain/ports/payer-change-lock.js";
import { PayerCollectionMeansRepository } from "../domain/ports/payer-collection-means.repository.js";
import { PayerTimeline } from "../domain/services/payer-timeline.js";

/** Le motif écrit à l'historique du moyen, que la fiche et le journal relisent. */
export const COUNTER_PAYER_MEANS_REASON = "Ouvert au comptoir : règlement par virement.";

/**
 * Le côté comptable de l'ouverture d'un compte au comptoir, qu'`account`
 * déclare (`CounterPayerOpening`) : le virement chez chaque entité émettrice
 * en service, dans la transaction de l'ouverture, sous le verrou du payeur
 * (`plan-comptes-du-comptoir.md`, § 3.2). Sans lui, la facture se lirait
 * « prélèvement sans mandat ».
 *
 * Module à part, décidé par Hugo le 2026-11-28 : l'ouvreur des organismes
 * publics ne se touche pas. Le geste de l'historique est le même — un
 * virement immédiat dès la dernière clôture passée (`openAsPublicPayer`,
 * dont le nom dit le premier usage) —, seul le motif change.
 *
 * Une entité mise en service APRÈS l'ouverture n'a pas de ligne : le payeur
 * y lirait le prélèvement par défaut.
 */
@Injectable()
export class CounterPayerOpener extends CounterPayerOpening {
  constructor(
    private readonly issuers: InvoiceIssuersReader,
    private readonly payerModes: PayerBillingModesReader,
    private readonly modeDates: BillingModeDatesReader,
    private readonly payerMeans: PayerCollectionMeansRepository,
    private readonly lock: PayerChangeLock,
    private readonly ids: IdGenerator,
    private readonly events: DomainEventPublisher,
  ) {
    super();
  }

  async open(payer: OpenedCounterPayer, at: Date, staffUserId: string): Promise<void> {
    await this.lock.lock(payer.id);
    for (const issuer of await this.issuers.activeIssuers()) {
      await this.openAt({ id: issuer.legalEntityId, name: issuer.name }, payer, at, staffUserId);
    }
  }

  private async openAt(
    entity: LegalEntitySubject,
    payer: OpenedCounterPayer,
    at: Date,
    staffId: string,
  ): Promise<void> {
    const history = await this.payerMeans.load(entity.id, payer);
    const closures = PayerTimeline.of(
      await this.payerModes.segmentsOfPayer(entity.id, payer.id),
      await this.modeDates.timelinesOf(entity.id),
    );
    const change = history.openAsPublicPayer(
      { segmentId: this.ids.next(), at, staffId, reason: COUNTER_PAYER_MEANS_REASON },
      closures,
    );
    if (change === null) {
      return;
    }
    await this.payerMeans.save(history);
    await this.events.publishTraced(
      new PayerCollectionMeansChangedEvent(payer, entity, at, change),
    );
  }
}
