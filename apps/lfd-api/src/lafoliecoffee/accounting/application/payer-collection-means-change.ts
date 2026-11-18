import type { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import type { IdGenerator } from "../../../platform/id/id-generator.js";
import type { NamedPayer } from "../domain/entities/payer-billing-mode-history.js";
import { PayerCollectionMeansChangedEvent } from "../domain/events/collection-means.events.js";
import type { LegalEntitySubject } from "../domain/events/legal-entity.events.js";
import type { BillingModeDatesReader } from "../domain/ports/billing-mode-dates.reader.js";
import type { PayerBillingModesReader } from "../domain/ports/payer-billing-modes.reader.js";
import type { PayerChangeLock } from "../domain/ports/payer-change-lock.js";
import type { PayerCollectionMeansRepository } from "../domain/ports/payer-collection-means.repository.js";
import type { PayerOrderHistoryReader } from "../domain/ports/payer-order-history.reader.js";
import type { PendingBankReturnsReader } from "../domain/ports/pending-bank-returns.reader.js";
import { PayerTimeline } from "../domain/services/payer-timeline.js";
import type { CollectionMeans } from "../domain/value-objects/collection-means.js";

/** Les ports d'un changement de moyen — ceux du geste du staff et de l'ouverture publique. */
export interface PayerMeansChangePorts {
  readonly payerModes: PayerBillingModesReader;
  readonly modeDates: BillingModeDatesReader;
  readonly payerMeans: PayerCollectionMeansRepository;
  readonly orderHistory: PayerOrderHistoryReader;
  readonly bankReturns: PendingBankReturnsReader;
  readonly lock: PayerChangeLock;
  readonly ids: IdGenerator;
  readonly events: DomainEventPublisher;
}

/** Le geste : quel moyen, à quel instant, par qui et pourquoi. */
export interface PayerMeansGestureInput {
  readonly means: CollectionMeans;
  readonly at: Date;
  readonly staffId: string;
  readonly reason: string;
}

/**
 * Change le moyen d'un payeur chez une entité, dans la transaction de
 * l'appelant. Sous le verrou du payeur (K11), pris AVANT de lire les deux
 * historiques ; l'historique date le changement sur les clôtures du MODE du
 * payeur et refuse pendant un retour bancaire ou un changement programmé
 * (K1). Le même moyen redemandé n'écrit rien et ne journalise rien.
 */
export async function changePayerCollectionMeans(
  ports: PayerMeansChangePorts,
  entity: LegalEntitySubject,
  payer: NamedPayer,
  gesture: PayerMeansGestureInput,
): Promise<void> {
  const { at } = gesture;
  await ports.lock.lock(payer.id);
  const history = await ports.payerMeans.load(entity.id, payer);
  const closures = PayerTimeline.of(
    await ports.payerModes.segmentsOfPayer(entity.id, payer.id),
    await ports.modeDates.timelinesOf(entity.id),
  );
  const change = history.change(
    gesture.means,
    { segmentId: ports.ids.next(), at, staffId: gesture.staffId, reason: gesture.reason },
    closures,
    {
      opening: !(await ports.orderHistory.hasEverOrdered(payer.id)),
      returnPending: await ports.bankReturns.hasPendingReturn(entity.id, payer.id),
      pendingMode: closures.pendingChange(at),
    },
  );
  if (change === null) {
    return;
  }
  await ports.payerMeans.save(history);
  await ports.events.publishTraced(new PayerCollectionMeansChangedEvent(payer, entity, at, change));
}
