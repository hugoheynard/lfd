import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { RequestReasonNotFoundError } from "../../domain/errors/contact-errors.js";
import { RequestReasonRepository } from "../../domain/ports/request-reason.repository.js";
import { ReviseRequestReasonCommand } from "./revise-request-reason.command.js";

/**
 * Révise un motif ; le motif refuse de changer de formulaire. Les demandes
 * déjà reçues gardent le libellé figé à leur réception.
 *
 * @sans-journal un réglage d'écran (cf. la création).
 */
@CommandHandler(ReviseRequestReasonCommand)
export class ReviseRequestReasonHandler implements ICommandHandler<
  ReviseRequestReasonCommand,
  void
> {
  constructor(
    private readonly reasons: RequestReasonRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: ReviseRequestReasonCommand): Promise<void> {
    const reason = await this.reasons.load(command.reasonId);
    if (reason === null) {
      throw new RequestReasonNotFoundError(command.reasonId);
    }
    reason.revise(command.payload, this.clock.now());
    await this.reasons.save(reason);
  }
}
