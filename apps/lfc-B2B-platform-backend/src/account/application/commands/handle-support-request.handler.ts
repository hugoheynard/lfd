import { CommandHandler, EventBus, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../infra/time/clock.js";
import { SupportHandledEvent } from "../../domain/events/support-handled.event.js";
import { SupportRequestNotFoundError } from "../../domain/errors/support-errors.js";
import { SupportRequestRepository } from "../../domain/ports/support-request.repository.js";
import { HandleSupportRequestCommand } from "./handle-support-request.command.js";

/**
 * Clôt une demande de contact. C'est **le geste qui manquait** : `handled_at`
 * n'était écrit nulle part, donc la file ne se purgeait jamais et le client
 * restait verrouillé par `OpenSupportRequestExistsError`.
 */
@CommandHandler(HandleSupportRequestCommand)
export class HandleSupportRequestHandler implements ICommandHandler<
  HandleSupportRequestCommand,
  void
> {
  constructor(
    private readonly support: SupportRequestRepository,
    private readonly events: EventBus,
    private readonly clock: Clock,
  ) {}

  async execute(command: HandleSupportRequestCommand): Promise<void> {
    const handledAt = this.clock.now();
    const handled = await this.support.markHandled(command.supportRequestId, handledAt);
    if (handled === null) {
      throw new SupportRequestNotFoundError(command.supportRequestId);
    }
    this.events.publish(
      new SupportHandledEvent(
        command.supportRequestId,
        handled.companyId,
        handled.requestedByUserId,
        handledAt,
      ),
    );
  }
}
