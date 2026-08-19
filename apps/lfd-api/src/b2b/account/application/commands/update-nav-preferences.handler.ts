import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { NavPreferencesRepository } from "../../domain/ports/nav-preferences.repository.js";
import { UpdateNavPreferencesCommand } from "./update-nav-preferences.command.js";

/**
 * Persiste la préférence d'affichage. Aucun invariant à rejouer : une donnée
 * purement UI ne protège rien — le handler se contente de la ranger. La
 * **forme** de la valeur est déjà garantie par le pipe Zod du contrôleur.
 */
@CommandHandler(UpdateNavPreferencesCommand)
export class UpdateNavPreferencesHandler implements ICommandHandler<
  UpdateNavPreferencesCommand,
  void
> {
  constructor(private readonly navPrefs: NavPreferencesRepository) {}

  async execute(command: UpdateNavPreferencesCommand): Promise<void> {
    await this.navPrefs.saveCatalogueView(command.userId, command.catalogueView);
  }
}
