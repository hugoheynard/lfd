import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { StaffNavPreferencesRepository } from "../domain/staff-nav-preferences.repository.js";
import { UpdateStaffNavPrefsCommand } from "./update-staff-nav-prefs.command.js";

/**
 * Range la préférence, et rien d'autre. Aucun invariant à rejouer : une donnée
 * purement UI ne protège rien, et la **forme** est déjà garantie par le pipe Zod
 * du contrôleur.
 *
 * Rend `void` : le client relit `/admin/me`. Une commande ne produit pas de
 * modèle de lecture.
 *
 * @sans-journal un réglage d'affichage que la personne pose POUR ELLE-MÊME :
 * il n'ouvre ni ne ferme aucun accès, et personne n'aura à demander « qui l'a
 * changé ».
 */
@CommandHandler(UpdateStaffNavPrefsCommand)
export class UpdateStaffNavPrefsHandler implements ICommandHandler<
  UpdateStaffNavPrefsCommand,
  void
> {
  constructor(private readonly navPrefs: StaffNavPreferencesRepository) {}

  async execute(command: UpdateStaffNavPrefsCommand): Promise<void> {
    await this.navPrefs.merge(command.staffUserId, command.patch);
  }
}
