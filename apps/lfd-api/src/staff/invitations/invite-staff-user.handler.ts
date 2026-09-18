import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { OpenStaffAccess, type StaffAccessOpened } from "./open-staff-access.service.js";
import { InviteStaffUserCommand } from "../directory/application/staff-user.commands.js";

/** Ce que l'invitation rapporte — le contrat n'a pas bougé. */
export type StaffInvited = StaffAccessOpened;

/**
 * Invite un membre de l'équipe — ou lui **renvoie** un lien, c'est le même
 * geste.
 *
 * Le travail vit dans {@link OpenStaffAccess} depuis que la **création** d'un
 * membre l'ouvre elle aussi : deux entrées, un seul comportement. Ce handler
 * reste la porte du renvoi, qui garde tout son sens — un lien est daté et à
 * usage unique, on en refait un, on n'en retrouve pas.
 *
 * Sa trace (`staff_user.invited`) est écrite par {@link OpenStaffAccess}, dans
 * la même transaction que `markInvited` et AVANT l'e-mail — c'est la seule
 * délégation que `lint:journal-tracked` admet dans l'équipe.
 */
@CommandHandler(InviteStaffUserCommand)
export class InviteStaffUserHandler implements ICommandHandler<
  InviteStaffUserCommand,
  StaffInvited
> {
  constructor(private readonly access: OpenStaffAccess) {}

  execute(command: InviteStaffUserCommand): Promise<StaffInvited> {
    return this.access.open(command.id);
  }
}
