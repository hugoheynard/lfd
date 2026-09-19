import { NotFoundException } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { SubscriptionOccurrenceOverriddenEvent } from "../../domain/events/subscription-acts.events.js";
import { SubscriptionRepository } from "../../domain/ports/subscription.repository.js";
import { IsoDate } from "../../domain/value-objects/iso-date.js";
import { SubscriptionLine } from "../../domain/value-objects/subscription-line.js";
import { UpsertOccurrenceOverrideCommand } from "./upsert-occurrence-override.command.js";

/**
 * Déroge à une échéance précise (« modifier cette commande uniquement »). Le mur
 * est dans `load` (sinon `404`). C'est l'agrégat qui arbitre : la date doit tomber
 * dans la fenêtre de l'abonnement, un saut n'a pas de ligne, une modification en a
 * au moins une. Le handler ne fait que traduire le payload en value-objects.
 *
 * Journalisé dans la transaction de l'écriture (depuis le 2026-09-19), avec la
 * dérogation que celle-ci remplace sur la même date.
 */
@CommandHandler(UpsertOccurrenceOverrideCommand)
export class UpsertOccurrenceOverrideHandler implements ICommandHandler<
  UpsertOccurrenceOverrideCommand,
  void
> {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UpsertOccurrenceOverrideCommand): Promise<void> {
    const subscription = await this.subscriptions.load(command.subscriptionId, command.actorUserId);
    if (subscription === null) {
      throw new NotFoundException("Panier récurrent introuvable.");
    }
    const { payload } = command;
    const date = IsoDate.fromString(command.date);
    const before = subscription.overrideOn(date);
    const after = subscription.overrideOccurrence(date, {
      skipped: payload.skipped,
      lines: payload.skipped
        ? []
        : payload.lines.map((line) => SubscriptionLine.create(line.sku, line.quantity)),
      note: payload.note,
    });
    await this.uow.run(async () => {
      await this.subscriptions.save(subscription);
      await this.events.publishTraced(
        new SubscriptionOccurrenceOverriddenEvent(
          command.subscriptionId,
          date.toString(),
          before,
          after,
        ),
      );
    });
  }
}
