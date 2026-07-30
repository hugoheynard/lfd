import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UserProfile } from "../../domain/entities/user-profile.js";
import {
  EmailAlreadyUsedError,
  UserProfileNotFoundError,
} from "../../domain/errors/account-errors.js";
import { CustomerIdentityPort } from "../../domain/ports/customer-identity.port.js";
import { UserProfileRepository } from "../../domain/ports/user-profile.repository.js";
import { UpdateMyProfileCommand } from "./update-my-profile.command.js";

/**
 * Enregistre le profil, et **propage l'e-mail à Auth0 avant** de l'écrire chez
 * nous.
 *
 * L'ordre n'est pas négociable : Auth0 authentifie avec cette adresse. Si on
 * écrivait d'abord et que la propagation échouait, l'utilisateur continuerait à se
 * connecter avec l'ancienne adresse tout en voyant la nouvelle — un état
 * incohérent, invisible, et pénible à diagnostiquer. En échouant d'abord, on ne
 * change rien du tout.
 */
@CommandHandler(UpdateMyProfileCommand)
export class UpdateMyProfileHandler implements ICommandHandler<UpdateMyProfileCommand, void> {
  constructor(
    private readonly profiles: UserProfileRepository,
    private readonly identity: CustomerIdentityPort,
  ) {}

  async execute(command: UpdateMyProfileCommand): Promise<void> {
    const current = await this.profiles.findById(command.userId);
    if (current === null) {
      throw new UserProfileNotFoundError(command.userId);
    }

    const profile = UserProfile.create(command);

    if (profile.emailDiffersFrom(current.email)) {
      await this.ensureEmailIsFree(profile.email.value, command.userId);
      await this.identity.changeEmail(command.subject, profile.email.value);
    }

    await this.profiles.save(command.userId, profile);
  }

  /**
   * Refuse une adresse déjà rattachée à un **autre** compte. La retrouver sur le
   * compte courant n'est pas un conflit : c'est le cas où seul le nom change.
   */
  private async ensureEmailIsFree(email: string, userId: string): Promise<void> {
    const owner = await this.profiles.findIdByEmail(email);
    if (owner !== null && owner !== userId) {
      throw new EmailAlreadyUsedError(email);
    }
  }
}
