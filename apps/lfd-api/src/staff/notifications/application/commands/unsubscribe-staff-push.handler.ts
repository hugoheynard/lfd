import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { StaffPushSubscriptions } from "../../domain/ports/staff-push.js";
import { UnsubscribeStaffPushCommand } from "./unsubscribe-staff-push.command.js";

/**
 * Oublie une installation. Idempotent : oublier un abonnement inconnu n'est
 * pas une erreur, c'est l'état voulu.
 *
 * @sans-journal même raison que l'abonnement.
 */
@CommandHandler(UnsubscribeStaffPushCommand)
export class UnsubscribeStaffPushHandler implements ICommandHandler<
  UnsubscribeStaffPushCommand,
  void
> {
  constructor(private readonly subscriptions: StaffPushSubscriptions) {}

  execute(command: UnsubscribeStaffPushCommand): Promise<void> {
    return this.subscriptions.forget(command.endpoint);
  }
}
