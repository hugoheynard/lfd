import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { ArticleSaleUnits } from "../../../catalog/application/article-sale-units.service.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { SubscriptionOccurrenceOverriddenEvent } from "../../domain/events/subscription-acts.events.js";
import { SubscriptionRepository } from "../../domain/ports/subscription.repository.js";
import { IsoDate } from "../../domain/value-objects/iso-date.js";
import { SubscriptionLine } from "../../domain/value-objects/subscription-line.js";
import { SubscriptionGestures } from "../services/subscription-gestures.js";
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
    private readonly gestures: SubscriptionGestures,
    private readonly saleUnits: ArticleSaleUnits,
  ) {}

  async execute(command: UpsertOccurrenceOverrideCommand): Promise<void> {
    // Le mur de N4e : panier de société ⇒ membre actuel. Pas d'avis au
    // principal pour une échéance dérogée (décision de Hugo, 2026-10-20).
    const subscription = await this.gestures.loadManaged(
      command.subscriptionId,
      command.actorUserId,
    );
    const { payload } = command;
    const weightSold = await this.saleUnits.weightSoldAmong(payload.lines.map((line) => line.sku));
    const date = IsoDate.fromString(command.date);
    const before = subscription.overrideOn(date);
    const after = subscription.overrideOccurrence(date, {
      skipped: payload.skipped,
      lines: payload.skipped
        ? []
        : payload.lines.map((line) =>
            SubscriptionLine.requested(
              line.sku,
              line.quantity,
              weightSold.has(line.sku) ? "weight" : "piece",
            ),
          ),
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
