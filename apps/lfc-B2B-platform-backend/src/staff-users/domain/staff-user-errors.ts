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
 * ni supprimé, ni rétrogradé hors du rôle `admin`, ni voir son e-mail changé —
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

/**
 * Mutation refusée : elle laisserait le back-office **sans administrateur**.
 *
 * L'admin racine protège une ligne, pas la propriété : rien n'empêchait jusqu'ici
 * de rétrograder tous les *autres* administrateurs. Refus **métier** (409).
 */
export class LastStaffAdminError extends BusinessError {
  constructor() {
    super(
      "staff_user.last_admin",
      "Il doit rester au moins un administrateur : désignez-en un autre d'abord.",
    );
  }
}

/**
 * Mutation refusée : la personne se retire **elle-même** ses droits.
 *
 * Le pied dans le plat le plus courant, et le seul qu'on ne peut pas réparer
 * soi-même — il faut alors quelqu'un d'autre. Refus **métier** (409).
 */
export class SelfDemotionError extends BusinessError {
  constructor() {
    super(
      "staff_user.self_demotion",
      "Vous ne pouvez pas retirer vos propres droits d'administration.",
    );
  }
}

/**
 * Dérogation refusée : elle couperait à un administrateur l'accès à l'annuaire.
 *
 * Sans ce refus, le delta contournerait par la porte de derrière l'invariant
 * « il reste au moins un administrateur » : l'admin serait toujours là, mais privé
 * du seul droit qui permet d'en désigner un autre. Refus **métier** (409).
 */
export class AdminOverrideRefusedError extends BusinessError {
  constructor() {
    super(
      "staff_user.admin_override_refused",
      "Un administrateur ne peut pas être privé de l'accès aux utilisateurs.",
    );
  }
}
