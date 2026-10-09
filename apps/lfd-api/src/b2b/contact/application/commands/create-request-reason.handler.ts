import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { RequestReason } from "../../domain/request-reason.js";
import { RequestReasonRepository } from "../../domain/ports/request-reason.repository.js";
import { CreateRequestReasonCommand } from "./create-request-reason.command.js";

/**
 * Crée un motif. Le motif refuse lui-même un type inconnu, un libellé
 * français vide ou une adresse invalide.
 *
 * @sans-journal un réglage d'écran sans règle de refus métier au-delà de la
 * validité ; seul le traitement d'une demande est un fait journalisé.
 */
@CommandHandler(CreateRequestReasonCommand)
export class CreateRequestReasonHandler implements ICommandHandler<
  CreateRequestReasonCommand,
  string
> {
  constructor(
    private readonly reasons: RequestReasonRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: CreateRequestReasonCommand): Promise<string> {
    const reason = RequestReason.create({
      ...command.payload,
      id: this.ids.next(),
      at: this.clock.now(),
    });
    await this.reasons.save(reason);
    return reason.id;
  }
}
