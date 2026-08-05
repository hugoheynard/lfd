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

/**
 * Mutation refusée : la cible est l'**admin racine** (bootstrap). Il ne peut être
 * ni supprimé, ni rétrogradé hors du scope `admin`, ni voir son e-mail changé —
 * sinon plus personne ne peut provisionner de comptes. Refus **métier** (409).
 */
export class ProtectedStaffUserError extends BusinessError {
  constructor() {
    super(
      "staff_user.protected",
      "L'administrateur racine ne peut être ni supprimé ni rétrogradé.",
    );
  }
}
