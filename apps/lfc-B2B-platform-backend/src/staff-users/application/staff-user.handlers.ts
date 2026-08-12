import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { StaffIdentityPort } from "../domain/staff-identity.port.js";
import { StaffUserRepository, type StaffIdentityFacts } from "../domain/staff-user.repository.js";
import { SetStaffStatusCommand } from "./set-staff-status.command.js";
import {
  CreateStaffUserCommand,
  RemoveStaffUserCommand,
  UpdateStaffUserCommand,
} from "./staff-user.commands.js";

/**
 * Handlers **staff** de l'annuaire. Minces : ils délèguent au repository, qui
 * rassemble les faits et laisse la politique de domaine trancher
 * (`staff-access.policy.ts`). Le mur d'entrée est l'`AdminAuthGuard` sur la route.
 */

@CommandHandler(CreateStaffUserCommand)
export class CreateStaffUserHandler implements ICommandHandler<CreateStaffUserCommand, string> {
  constructor(private readonly staff: StaffUserRepository) {}

  execute(command: CreateStaffUserCommand): Promise<string> {
    return this.staff.create(command.payload, command.actorSub);
  }
}

/**
 * Édite une fiche, **et tient l'adresse de connexion alignée**.
 *
 * Sans le second geste, renommer quelqu'un dans l'annuaire le laissait se
 * connecter avec son ancienne adresse pendant que l'écran en affichait une
 * autre — la liaison par `sub` lui gardait son accès, mais l'application
 * mentait.
 *
 * **L'ordre est un compromis assumé.** On écrit d'abord chez nous, parce que
 * c'est l'écriture locale qui fait tourner la politique de domaine : propager
 * avant validerait chez Auth0 un changement que la règle de l'admin racine peut
 * encore refuser. Le risque résiduel — écriture locale faite, propagation
 * échouée — est donc **tracé explicitement avec les deux adresses**, pour qu'il
 * soit réparable plutôt que découvert six mois plus tard.
 */
@CommandHandler(UpdateStaffUserCommand)
export class UpdateStaffUserHandler implements ICommandHandler<UpdateStaffUserCommand, void> {
  private readonly logger = new Logger(UpdateStaffUserHandler.name);

  constructor(
    private readonly staff: StaffUserRepository,
    private readonly identities: StaffIdentityPort,
  ) {}

  async execute(command: UpdateStaffUserCommand): Promise<void> {
    const before = await this.staff.identityOf(command.id);
    await this.staff.update(command.id, command.payload, command.actorSub);
    await this.propagateEmail(before, command.payload.email);
  }

  /**
   * Propage l'adresse **uniquement** si elle a bougé et qu'une identité existe.
   *
   * Une fiche jamais liée n'a rien à propager : son adresse servira au premier
   * rapprochement, et l'invitation ouvrira l'identité avec la bonne.
   */
  private async propagateEmail(before: StaffIdentityFacts, next: string): Promise<void> {
    const wanted = next.trim().toLowerCase();
    if (before.auth0Id === null || wanted === before.email) {
      return;
    }
    try {
      await this.identities.changeEmail(before.auth0Id, wanted);
    } catch (error) {
      this.logger.error(
        `Adresse désynchronisée pour ${before.auth0Id} : annuaire=${wanted}, ` +
          `fournisseur=${before.email}. À reprendre à la main.`,
        error,
      );
      throw error;
    }
  }
}

@CommandHandler(RemoveStaffUserCommand)
export class RemoveStaffUserHandler implements ICommandHandler<RemoveStaffUserCommand, void> {
  constructor(private readonly staff: StaffUserRepository) {}

  async execute(command: RemoveStaffUserCommand): Promise<void> {
    await this.staff.remove(command.id, command.actorSub);
  }
}

@CommandHandler(SetStaffStatusCommand)
export class SetStaffStatusHandler implements ICommandHandler<SetStaffStatusCommand, void> {
  constructor(private readonly staff: StaffUserRepository) {}

  async execute(command: SetStaffStatusCommand): Promise<void> {
    await this.staff.setStatus(command.id, command.change, command.actorSub);
  }
}
