import { Injectable } from "@nestjs/common";

import {
  PublicPayerOpening,
  type OpenedPublicPayer,
} from "../../account/domain/ports/public-payer-opening.js";
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
export const PUBLIC_PAYER_MEANS_REASON = "Organisme public : règlement par virement.";

/**
 * Le côté comptable de l'ouverture d'un organisme public, qu'`account`
 * déclare (`PublicPayerOpening`) : chez chaque entité émettrice en service,
 * l'historique du moyen pose le virement par son geste dédié
 * (`openAsPublicPayer`) — immédiat, programmés annulés — dans la transaction
 * de l'activation, sous le verrou du payeur.
 *
 * Ni un changement de mode programmé ni un retour bancaire en attente ne
 * l'arrêtent : le moyen a son propre historique, il ne lit le mode que pour
 * trouver la dernière clôture passée.
 */
@Injectable()
export class PublicPayerOpener extends PublicPayerOpening {
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

  async open(payer: OpenedPublicPayer, at: Date, staffUserId: string): Promise<void> {
    await this.lock.lock(payer.id);
    for (const issuer of await this.issuers.activeIssuers()) {
      await this.openAt({ id: issuer.legalEntityId, name: issuer.name }, payer, at, staffUserId);
    }
  }

  private async openAt(
    entity: LegalEntitySubject,
    payer: OpenedPublicPayer,
    at: Date,
    staffId: string,
  ): Promise<void> {
    const history = await this.payerMeans.load(entity.id, payer);
    const closures = PayerTimeline.of(
      await this.payerModes.segmentsOfPayer(entity.id, payer.id),
      await this.modeDates.timelinesOf(entity.id),
    );
    const change = history.openAsPublicPayer(
      { segmentId: this.ids.next(), at, staffId, reason: PUBLIC_PAYER_MEANS_REASON },
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
