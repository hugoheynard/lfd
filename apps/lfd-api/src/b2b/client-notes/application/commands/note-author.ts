import type { StaffDirectory } from "../../../account/domain/ports/staff-directory.js";
import type { ClientNoteAuthor } from "../../domain/entities/client-notebook.js";

/**
 * Qui dépose la note, **figé maintenant** : le `sub` toujours, le nom quand
 * l'annuaire le connaît — comme l'auteur d'un écart d'accès aux fonctionnalités.
 * Vide sinon : on n'invente pas un nom.
 */
export async function noteAuthorOf(
  staff: StaffDirectory,
  staffSub: string,
): Promise<ClientNoteAuthor> {
  const agent = await staff.identify(staffSub);
  return { sub: staffSub, name: agent?.name ?? "" };
}
