import { NotFoundException } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { SubscriptionRepository } from "../../domain/ports/subscription.repository.js";
import { IsoDate } from "../../domain/value-objects/iso-date.js";
import { SubscriptionLine } from "../../domain/value-objects/subscription-line.js";
import { UpsertOccurrenceOverrideCommand } from "./upsert-occurrence-override.command.js";

/**
 * Déroge à une échéance précise (« modifier cette commande uniquement »). Le mur
 * est dans `load` (sinon `404`). C'est l'agrégat qui arbitre : la date doit tomber
 * dans la fenêtre de l'abonnement, un saut n'a pas de ligne, une modification en a
 * au moins une. Le handler ne fait que traduire le payload en value-objects.
 */
@CommandHandler(UpsertOccurrenceOverrideCommand)
export class UpsertOccurrenceOverrideHandler implements ICommandHandler<
  UpsertOccurrenceOverrideCommand,
  void
> {
  constructor(private readonly subscriptions: SubscriptionRepository) {}

  async execute(command: UpsertOccurrenceOverrideCommand): Promise<void> {
    const subscription = await this.subscriptions.load(command.subscriptionId, command.actorUserId);
    if (subscription === null) {
      throw new NotFoundException("Panier récurrent introuvable.");
    }
    const { payload } = command;
    subscription.overrideOccurrence(IsoDate.fromString(command.date), {
      skipped: payload.skipped,
      lines: payload.skipped
        ? []
        : payload.lines.map((line) => SubscriptionLine.create(line.sku, line.quantity)),
      note: payload.note,
    });
    await this.subscriptions.save(subscription);
  }
}
