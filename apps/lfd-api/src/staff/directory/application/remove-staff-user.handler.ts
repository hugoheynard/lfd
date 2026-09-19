import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { StaffUserRemovalRetiredError } from "../domain/staff-user-errors.js";
import { RemoveStaffUserCommand } from "./staff-user.commands.js";

/**
 * La suppression d'une fiche **n'existe plus** : ce handler refuse, toujours.
 *
 * Une fiche est l'auteur de ce que la personne a fait, et la table des `sub`
 * qui convertira l'histoire en ids de fiche s'appuie sur elle (
 * `architecture-journalisation.md` §12, étape 0). Une fiche supprimée entre deux
 * étapes de ce plan emporterait la seule trace de ses identifiants.
 *
 * La route reste servie — elle répond `409` en nommant le geste de sortie —
 * jusqu'à ce que « Retirer de l'équipe » la remplace (plan de départ, D8).
 * Le dépôt de fiches n'a plus de méthode de suppression : ce refus n'est pas
 * une garde devant une écriture, c'est l'absence de l'écriture.
 *
 * @throws {StaffUserRemovalRetiredError} toujours.
 */
@CommandHandler(RemoveStaffUserCommand)
export class RemoveStaffUserHandler implements ICommandHandler<RemoveStaffUserCommand, void> {
  execute(_command: RemoveStaffUserCommand): Promise<void> {
    return Promise.reject(new StaffUserRemovalRetiredError());
  }
}
