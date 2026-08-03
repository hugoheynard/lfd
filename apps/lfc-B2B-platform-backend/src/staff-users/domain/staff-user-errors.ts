import { BusinessError, ResourceNotFoundError } from "../../shared/errors/app-error.js";

/** Le user staff visé n'existe pas (**404**). */
export class StaffUserNotFoundError extends ResourceNotFoundError {
  constructor(readonly id: string) {
    super("staff_user.not_found", "Utilisateur staff introuvable.");
  }
}

/**
 * Création/édition refusée : l'e-mail est **déjà pris**. Refus **métier** (409) —
 * l'e-mail est la clé humaine unique de l'annuaire.
 */
export class DuplicateStaffEmailError extends BusinessError {
  constructor(readonly email: string) {
    super("staff_user.duplicate_email", "Un utilisateur staff utilise déjà cet e-mail.");
  }
}
