import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Journal } from "../../../platform/journal/journal.js";
import { StaffIdentityPort } from "../../invitations/staff-identity.port.js";
import { StaffAccessCache } from "../../permissions/staff-access-cache.port.js";
import { staffUserEditFacts } from "../domain/staff-facts.js";
import type { StaffUserEdit } from "../domain/staff-user-state.js";
import { StaffUserRepository } from "../domain/staff-user.repository.js";
import { UpdateStaffUserCommand } from "./staff-user.commands.js";

/**
 * Édite une fiche, **et tient l'adresse de connexion alignée**.
 *
 * Sans le second geste, renommer quelqu'un dans l'annuaire le laissait se
 * connecter avec son ancienne adresse pendant que l'écran en affichait une
 * autre — la liaison par `sub` lui gardait son accès, mais l'application
 * mentait.
 *
 * **L'écriture locale et ses faits partent ensemble** — un par changement réel
 * (identité, rôle, dérogations), aucun pour une édition vide. Le cache d'accès
 * est oublié **après** le commit : vidé avant, une requête concurrente le
 * remplirait avec l'état d'avant.
 *
 * **L'ordre est un compromis assumé.** On écrit d'abord chez nous, parce que
 * c'est l'écriture locale qui fait tourner la politique de domaine : propager
 * avant validerait chez Auth0 un changement que la règle de l'admin racine peut
 * encore refuser. Le risque résiduel — écriture locale faite, propagation
 * échouée — est donc **tracé explicitement avec les deux adresses**, pour qu'il
 * soit réparable plutôt que découvert six mois plus tard. La trace du journal,
 * elle, décrit l'écriture locale, qui est faite.
 */
@CommandHandler(UpdateStaffUserCommand)
export class UpdateStaffUserHandler implements ICommandHandler<UpdateStaffUserCommand, void> {
  private readonly logger = new Logger(UpdateStaffUserHandler.name);

  constructor(
    private readonly staff: StaffUserRepository,
    private readonly identities: StaffIdentityPort,
    private readonly journal: Journal,
    private readonly uow: UnitOfWork,
    private readonly cache: StaffAccessCache,
  ) {}

  async execute(command: UpdateStaffUserCommand): Promise<void> {
    const edit = await this.uow.run(async () => {
      const written = await this.staff.update(command.id, command.payload, command.actorId);
      for (const fact of staffUserEditFacts(command.id, written)) {
        await this.journal.append(fact);
      }
      return written;
    });
    this.cache.forgetAll();
    await this.propagateEmail(edit);
  }

  /**
   * Propage l'adresse **uniquement** si elle a bougé et qu'une identité existe.
   *
   * Une fiche jamais liée n'a rien à propager : son adresse servira au premier
   * rapprochement, et l'invitation ouvrira l'identité avec la bonne.
   */
  private async propagateEmail(edit: StaffUserEdit): Promise<void> {
    const { before, after } = edit;
    if (before.auth0Id === null || after.email === before.email) {
      return;
    }
    try {
      await this.identities.changeEmail(before.auth0Id, after.email);
    } catch (error) {
      this.logger.error(
        `Adresse désynchronisée pour ${before.auth0Id} : annuaire=${after.email}, ` +
          `fournisseur=${before.email}. À reprendre à la main.`,
        error,
      );
      throw error;
    }
  }
}
