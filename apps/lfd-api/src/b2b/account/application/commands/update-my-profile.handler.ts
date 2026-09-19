import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { UserProfile } from "../../domain/entities/user-profile.js";
import {
  EmailAlreadyUsedError,
  UserProfileNotFoundError,
} from "../../domain/errors/account-errors.js";
import { UserProfileUpdatedEvent } from "../../domain/events/person-acts.event.js";
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
 *
 * `@hors-transaction` le changement d'adresse part chez Auth0 AVANT la
 * transaction, qui ne peut pas l'annuler (plan
 * `documentation/journalisation/plan-journal-d-activite.md` §3, décision 1). Le
 * fait `user.profile_updated` s'écrit donc après sa réussite, dans la
 * transaction du profil : un journal en panne n'écrit pas le profil, mais
 * laisse l'adresse déjà changée chez Auth0 — le même écart qu'une panne de base
 * après la propagation, que l'ordre ci-dessus accepte déjà, et que la personne
 * voit à l'erreur.
 */
@CommandHandler(UpdateMyProfileCommand)
export class UpdateMyProfileHandler implements ICommandHandler<UpdateMyProfileCommand, void> {
  constructor(
    private readonly profiles: UserProfileRepository,
    private readonly identity: CustomerIdentityPort,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UpdateMyProfileCommand): Promise<void> {
    const current = await this.profiles.findById(command.userId);
    if (current === null) {
      throw new UserProfileNotFoundError(command.userId);
    }

    const profile = UserProfile.revise(current.email, command);

    if (profile.emailChanged) {
      await this.ensureEmailIsFree(profile.email.value, command.userId);
      await this.identity.changeEmail(command.subject, profile.email.value);
    }

    const fields = profile.changedFieldsSince(current);
    await this.uow.run(async () => {
      await this.profiles.save(command.userId, profile);
      // Un envoi sans changement réel n'affirme rien : pas de fait.
      if (fields.length > 0) {
        await this.events.publishTraced(new UserProfileUpdatedEvent(command.userId, fields));
      }
    });
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
