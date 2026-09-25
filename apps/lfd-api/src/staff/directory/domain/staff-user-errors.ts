import { BusinessError, ResourceNotFoundError } from "../../../platform/shared/errors/app-error.js";

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
      "La fiche racine (l'adresse de secours) ne peut être ni supprimée, ni suspendue, " +
        "ni renommée, ni changer de rôle.",
    );
  }
}

/**
 * Mutation refusée : plus personne — la fiche de secours mise à part — ne
 * tiendrait `staff_access:write` par son rôle.
 *
 * L'admin racine protège une ligne, pas la propriété. Depuis que les rôles se
 * lisent en base (plan `plan-roles-lus-en-base.md` §3.3), la propriété ne tient
 * plus sur la chaîne `"admin"` — qui s'édite — mais sur le droit lui-même, et
 * elle vaut qu'on modifie une fiche, un rôle ou un écart. Refus **métier** (409).
 */
export class LastStaffAdminError extends BusinessError {
  constructor() {
    super(
      "staff_user.last_admin",
      "Il doit rester au moins une personne active qui gère les utilisateurs par son rôle : " +
        "donnez ce droit à quelqu'un d'autre d'abord.",
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
      "Vous ne pouvez pas vous retirer à vous-même le droit de gérer les utilisateurs : " +
        "demandez-le à une autre personne qui le tient.",
    );
  }
}

/**
 * Dérogation refusée : elle couperait l'accès à l'annuaire à quelqu'un dont le
 * RÔLE l'accorde.
 *
 * Sans ce refus, le delta contournerait par la porte de derrière l'invariant
 * « il reste au moins un administrateur » : l'admin serait toujours là, mais privé
 * du seul droit qui permet d'en désigner un autre. Refus **métier** (409).
 */
export class AdminOverrideRefusedError extends BusinessError {
  constructor() {
    super(
      "staff_user.admin_override_refused",
      "Un écart ne peut pas retirer l'accès aux utilisateurs que le rôle accorde : " +
        "changez plutôt le rôle de la personne.",
    );
  }
}

/**
 * Dérogation refusée : elle **ouvrirait l'annuaire** à quelqu'un que son rôle n'y
 * autorise pas.
 *
 * Accorder des droits est le seul geste qui permet de s'en accorder : une
 * personne qui obtient `staff:write` par dérogation peut s'attribuer le rôle
 * `admin` dans la foulée, et le modèle n'a plus de sommet. L'annuaire s'ouvre
 * **par le rôle**, jamais par un delta. Refus **métier** (409).
 */
export class StaffGrantByOverrideError extends BusinessError {
  constructor() {
    super(
      "staff_user.staff_grant_by_override",
      "L'accès aux utilisateurs ne s'accorde que par le rôle, jamais par un écart.",
    );
  }
}

/**
 * On n'invite pas quelqu'un qu'on vient de suspendre.
 *
 * Le geste paraît anodin — un lien de mot de passe — mais il rouvrirait la
 * porte que la suspension a fermée : suivre le lien, c'est entrer, et l'entrée
 * fait passer la fiche en `active`. Réintégrer d'abord, inviter ensuite : deux
 * décisions, dans cet ordre. Refus **métier** (409).
 */
export class SuspendedStaffInviteError extends BusinessError {
  constructor() {
    super(
      "staff_user.suspended_invite",
      "Cette personne est suspendue : réintégrez-la avant de l'inviter.",
    );
  }
}

/**
 * Suppression d'une fiche refusée — **toujours** : le geste n'existe plus.
 *
 * Une fiche est l'auteur de tout ce que la personne a fait : commandes
 * remises, tarifs posés, fiches validées, journal. La supprimer effacerait
 * ce nom de chacune de ces lignes, et avec elle la seule trace des
 * identifiants de connexion qu'elle a portés (
 * `architecture-journalisation.md` §12, étape 0 ; plan de départ, D8). Le geste de
 * sortie sera « Retirer de l'équipe » ; en attendant, « Suspendre » ferme tout
 * sans rien détruire. Refus **métier** (409).
 */
export class StaffUserRemovalRetiredError extends BusinessError {
  constructor() {
    super(
      "staff_user.removal_retired",
      "On ne supprime plus une fiche : elle signe tout ce que la personne a fait, et la supprimer effacerait son nom de ces actes. Pour lui couper l'accès, suspendez-la — « Retirer de l'équipe » remplacera bientôt ce geste.",
    );
  }
}
