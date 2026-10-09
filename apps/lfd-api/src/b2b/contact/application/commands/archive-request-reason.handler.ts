import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { RequestReasonNotFoundError } from "../../domain/errors/contact-errors.js";
import { RequestReasonRepository } from "../../domain/ports/request-reason.repository.js";
import { ArchiveRequestReasonCommand } from "./archive-request-reason.command.js";

/**
 * Archive un motif, jamais ne le supprime : une demande reçue cite son motif.
 *
 * @sans-journal un réglage d'écran (cf. la création).
 */
@CommandHandler(ArchiveRequestReasonCommand)
export class ArchiveRequestReasonHandler implements ICommandHandler<
  ArchiveRequestReasonCommand,
  void
> {
  constructor(
    private readonly reasons: RequestReasonRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: ArchiveRequestReasonCommand): Promise<void> {
    const reason = await this.reasons.load(command.reasonId);
    if (reason === null) {
      throw new RequestReasonNotFoundError(command.reasonId);
    }
    reason.archive(this.clock.now());
    await this.reasons.save(reason);
  }
}
