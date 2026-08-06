import { NotFoundException } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { SubscriptionReader } from "../../domain/ports/subscription.reader.js";
import { SubscriptionRepository } from "../../domain/ports/subscription.repository.js";
import { UpsertOccurrenceOverrideCommand } from "./upsert-occurrence-override.command.js";

/**
 * Écrit (ou remplace) la dérogation d'une échéance. On vérifie d'abord le **mur** :
 * l'abonnement doit appartenir à l'acteur — sinon `404` (on ne divulgue pas son
 * existence). `skipped` ⇒ lignes vidées ; sinon les lignes du corps remplacent le
 * gabarit pour cette date-là.
 */
@CommandHandler(UpsertOccurrenceOverrideCommand)
export class UpsertOccurrenceOverrideHandler implements ICommandHandler<
  UpsertOccurrenceOverrideCommand,
  void
> {
  constructor(
    private readonly reader: SubscriptionReader,
    private readonly subscriptions: SubscriptionRepository,
  ) {}

  async execute(command: UpsertOccurrenceOverrideCommand): Promise<void> {
    const owner = await this.reader.findOwner(command.subscriptionId);
    if (owner !== command.actorUserId) {
      throw new NotFoundException("Panier récurrent introuvable.");
    }
    const { payload } = command;
    await this.subscriptions.upsertOccurrence({
      subscriptionId: command.subscriptionId,
      occurrenceDate: new Date(command.date),
      skipped: payload.skipped,
      lines: payload.skipped ? [] : payload.lines,
      note: payload.note,
    });
  }
}
