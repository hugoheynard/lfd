import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { NavPreferencesRepository } from "../../domain/ports/nav-preferences.repository.js";
import { assertWorkspaceWithinReach } from "../../domain/value-objects/nav-preferences.js";
import { UpdateNavPreferencesCommand } from "./update-nav-preferences.command.js";

/**
 * Range les préférences de navigation. La **forme** est garantie par le pipe Zod
 * du contrôleur ; une seule règle peut refuser : l'espace doit être « perso »,
 * `null`, ou une société de la personne.
 *
 * Pas d'agrégat chargé puis sauvé, et c'est voulu : la règle ne lit que les
 * rattachements du `Principal`, jamais l'état du sac, et une lecture-écriture
 * rouvrirait la course que la fusion en une instruction ferme.
 *
 * @throws {WorkspaceOutOfReachError} l'espace désigne une société étrangère.
 */
@CommandHandler(UpdateNavPreferencesCommand)
export class UpdateNavPreferencesHandler implements ICommandHandler<
  UpdateNavPreferencesCommand,
  void
> {
  constructor(private readonly navPrefs: NavPreferencesRepository) {}

  async execute(command: UpdateNavPreferencesCommand): Promise<void> {
    if (command.patch.workspace !== undefined) {
      assertWorkspaceWithinReach(command.patch.workspace, command.companyIds);
    }
    await this.navPrefs.merge(command.userId, command.patch);
  }
}
