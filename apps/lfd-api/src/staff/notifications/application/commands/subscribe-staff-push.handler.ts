import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { StaffPushSubscriptions } from "../../domain/ports/staff-push.js";
import { SubscribeStaffPushCommand } from "./subscribe-staff-push.command.js";

/**
 * Abonne une installation. Idempotent par `endpoint` : un navigateur qui se
 * réabonne remplace son abonnement.
 *
 * @sans-journal un abonnement d'appareil n'est pas une décision sur l'accès de
 * quelqu'un ; il porte déjà qui l'a posé.
 */
@CommandHandler(SubscribeStaffPushCommand)
export class SubscribeStaffPushHandler implements ICommandHandler<SubscribeStaffPushCommand, void> {
  constructor(private readonly subscriptions: StaffPushSubscriptions) {}

  execute(command: SubscribeStaffPushCommand): Promise<void> {
    return this.subscriptions.save(command.target, command.staffUserId);
  }
}
