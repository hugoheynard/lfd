import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { PayerCollectionMeansChangedEvent } from "../../domain/events/collection-means.events.js";
import { BillingModeDatesReader } from "../../domain/ports/billing-mode-dates.reader.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { PayerChangeLock } from "../../domain/ports/payer-change-lock.js";
import { PayerBillingModesReader } from "../../domain/ports/payer-billing-modes.reader.js";
import { PayerCollectionMeansRepository } from "../../domain/ports/payer-collection-means.repository.js";
import { PayerOrderHistoryReader } from "../../domain/ports/payer-order-history.reader.js";
import { PayerStandingReader } from "../../domain/ports/payer-standing.reader.js";
import { PendingBankReturnsReader } from "../../domain/ports/pending-bank-returns.reader.js";
import { requireCollectionMeansPayer } from "../../domain/services/collection-means-payer.js";
import { PayerTimeline } from "../../domain/services/payer-timeline.js";
import { collectionMeansOf } from "../../domain/value-objects/collection-means.js";
import { loadOrFail } from "../legal-entity-support.js";
import { SetPayerCollectionMeansCommand } from "./set-payer-collection-means.command.js";

/**
 * Change le moyen d'un payeur. Le domaine juge qu'il est un payeur (un site
 * qui suit son principal prend le moyen du principal), puis l'historique
 * date le changement sur les clôtures du MODE du payeur — immédiat s'il n'a
 * jamais commandé et que rien n'est écrit depuis sa dernière clôture, sinon
 * la prochaine — et refuse pendant un retour bancaire ou un changement de
 * mode programmé (K1). Le même moyen redemandé n'écrit rien.
 *
 * Sous le verrou du payeur (K11), pris AVANT de lire les deux historiques :
 * un geste de mode simultané attend, puis lit ce moyen programmé. Le
 * verrou, la lecture, l'historique et le fait sont dans une transaction.
 */
@CommandHandler(SetPayerCollectionMeansCommand)
export class SetPayerCollectionMeansHandler implements ICommandHandler<
  SetPayerCollectionMeansCommand,
  void
> {
  constructor(
    private readonly entities: LegalEntityRepository,
    private readonly standings: PayerStandingReader,
    private readonly modeDates: BillingModeDatesReader,
    private readonly payerModes: PayerBillingModesReader,
    private readonly payerMeans: PayerCollectionMeansRepository,
    private readonly orderHistory: PayerOrderHistoryReader,
    private readonly bankReturns: PendingBankReturnsReader,
    private readonly lock: PayerChangeLock,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetPayerCollectionMeansCommand): Promise<void> {
    const means = collectionMeansOf(command.means);
    const entity = await loadOrFail(this.entities, command.legalEntityId);
    const at = this.clock.now();
    const payer = requireCollectionMeansPayer(
      command.payerCompanyId,
      await this.standings.standingOf(command.payerCompanyId, at),
      at,
    );
    await this.uow.run(async () => {
      await this.lock.lock(payer.id);
      const history = await this.payerMeans.load(entity.id, payer);
      const closures = PayerTimeline.of(
        await this.payerModes.segmentsOfPayer(entity.id, payer.id),
        await this.modeDates.timelinesOf(entity.id),
      );
      const change = history.change(
        means,
        { segmentId: this.ids.next(), at, staffId: command.staffId, reason: command.reason },
        closures,
        {
          opening: !(await this.orderHistory.hasEverOrdered(payer.id)),
          returnPending: await this.bankReturns.hasPendingReturn(entity.id, payer.id),
          pendingMode: closures.pendingChange(at),
        },
      );
      if (change === null) {
        return;
      }
      await this.payerMeans.save(history);
      await this.events.publishTraced(
        new PayerCollectionMeansChangedEvent(
          payer,
          { id: entity.id, name: entity.name },
          at,
          change,
        ),
      );
    });
  }
}
