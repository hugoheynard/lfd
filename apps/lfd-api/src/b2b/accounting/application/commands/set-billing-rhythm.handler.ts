import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { BillingRhythmChangedEvent } from "../../domain/events/billing-rhythm.events.js";
import { InvoicedClosuresReader } from "../../domain/ports/invoiced-closures.reader.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { BillingRhythm } from "../../domain/value-objects/billing-rhythm.js";
import { loadOrFail } from "../legal-entity-support.js";
import { SetBillingRhythmCommand } from "./set-billing-rhythm.command.js";

/**
 * Règle le rythme de facturation de l'entité.
 *
 * La forme des jours est jugée par `BillingRhythm`, la prise d'effet — la
 * prochaine clôture de l'ancien rythme, jamais l'instant du geste — par
 * l'agrégat. Ce handler charge, lit si la clôture de prise d'effet d'un
 * changement déjà programmé a été tentée par la facture (§12 : un seul
 * changement à la fois — l'agrégat refuse, il ne lit pas la base), appelle,
 * sauve et journalise, et seulement si quelque chose a changé : une saisie
 * rejouée n'est pas un fait.
 *
 * Aucune facture ni aucun lot n'est touché ici : ils suivront le rythme qui
 * fait foi à leur clôture (lots R3 et R4 du plan).
 */
@CommandHandler(SetBillingRhythmCommand)
export class SetBillingRhythmHandler implements ICommandHandler<SetBillingRhythmCommand, void> {
  constructor(
    private readonly entities: LegalEntityRepository,
    private readonly invoicedClosures: InvoicedClosuresReader,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute({ legalEntityId, kind, days }: SetBillingRhythmCommand): Promise<void> {
    const rhythm = BillingRhythm.chosen(kind, days);
    const entity = await loadOrFail(this.entities, legalEntityId);
    const at = this.clock.now();
    const scheduled = entity.billingRhythm.scheduled;
    const scheduledInvoiced =
      scheduled !== null &&
      (await this.invoicedClosures.attempted(entity.id, scheduled.effectiveAt));
    const change = entity.changeBillingRhythm(rhythm, at, scheduledInvoiced);
    if (change === null) {
      return;
    }
    await this.uow.run(async () => {
      await this.entities.save(entity);
      await this.events.publishTraced(
        new BillingRhythmChangedEvent({ id: entity.id, name: entity.name }, at, change),
      );
    });
  }
}
