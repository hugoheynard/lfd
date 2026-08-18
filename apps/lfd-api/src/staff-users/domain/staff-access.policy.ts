import {
  hasStaffPermission,
  resolveStaffPermissions,
  type StaffOverride,
  type StaffRole,
  type StaffStatus,
} from "@lfd/contracts";

import {
  AdminOverrideRefusedError,
  LastStaffAdminError,
  ProtectedStaffUserError,
  SelfDemotionError,
  StaffGrantByOverrideError,
} from "./staff-user-errors.js";

/**
 * Les garde-fous qui rendent **impossible de se verrouiller dehors**.
 *
 * Un système de permissions a une façon spectaculaire d'échouer : fonctionner
 * parfaitement, et enfermer tout le monde à l'extérieur. Ces règles vivent ici —
 * dans le domaine, pas dans un écran, qui n'est qu'une suggestion — et elles se
 * testent sans base ni HTTP.
 *
 * Modèle complet : `documentation/b2b/architecture-acces-staff.md` §6.
 */

/** Ce qu'il faut savoir de la personne visée pour trancher une mutation. */
export interface StaffMutationTarget {
  /** L'e-mail **actuel** en base — la référence de la règle « racine non renommable ». */
  readonly email: string;
  /**
   * Vrai si cette fiche est l'**admin racine**. Le domaine ne connaît pas
   * l'adresse : elle est configurable par déploiement, et une règle qui
   * dépendrait d'une constante d'environnement ne serait plus une règle de
   * domaine.
   */
  readonly isRoot: boolean;
  readonly role: StaffRole;
  /**
   * Le nombre d'**autres** administrateurs encore en état d'entrer, c'est-à-dire
   * non suspendus. On ne compte pas les seuls `active` : quelqu'un qui n'a jamais
   * ouvert sa session reste un recours valide, il lui suffit de se connecter.
   */
  readonly otherLivingAdmins: number;
  /**
   * Vrai si l'auteur de la mutation est la personne visée. Reste `false` tant que
   * la résolution d'identité staff n'existe pas (tranche 3) : le garde-fou est
   * alors inerte, jamais faux.
   */
  readonly isSelf: boolean;
}

/** Ce que la mutation veut écrire. */
export interface StaffMutationIntent {
  readonly email: string;
  readonly role: StaffRole;
  readonly overrides: readonly StaffOverride[];
}

/**
 * Autorise (ou refuse) une **édition** de fiche.
 *
 * @throws {ProtectedStaffUserError} la cible est l'admin racine et la mutation le
 *   renommerait ou le rétrograderait.
 * @throws {SelfDemotionError} l'auteur se retire son propre rôle `admin`.
 * @throws {LastStaffAdminError} la mutation retirerait le dernier administrateur.
 * @throws {AdminOverrideRefusedError} une dérogation priverait un admin de `staff:write`.
 */
export function assertEditAllowed(target: StaffMutationTarget, intent: StaffMutationIntent): void {
  assertRootAdminIntact(target, intent);
  assertOverridesAllowed(intent);
  if (losesAdmin(target, intent.role)) {
    assertAdminRemovable(target);
  }
}

/**
 * Autorise (ou refuse) une **suppression**.
 *
 * @throws {ProtectedStaffUserError} la cible est l'admin racine (ineffaçable).
 * @throws {SelfDemotionError} l'auteur se supprime lui-même alors qu'il est admin.
 * @throws {LastStaffAdminError} la cible est le dernier administrateur.
 */
export function assertRemovalAllowed(target: StaffMutationTarget): void {
  if (target.isRoot) {
    throw new ProtectedStaffUserError();
  }
  if (target.role === "admin") {
    assertAdminRemovable(target);
  }
}

/**
 * Autorise (ou refuse) un changement d'**état de connexion**. Seule la suspension
 * retire un accès ; les autres transitions se constatent et ne menacent personne.
 *
 * @throws {ProtectedStaffUserError} la cible est l'admin racine.
 * @throws {SelfDemotionError} l'auteur se suspend lui-même alors qu'il est admin.
 * @throws {LastStaffAdminError} suspendre laisserait le back-office sans admin.
 */
export function assertStatusChangeAllowed(
  target: StaffMutationTarget,
  nextStatus: StaffStatus,
): void {
  if (nextStatus !== "suspended") {
    return;
  }
  if (target.isRoot) {
    throw new ProtectedStaffUserError();
  }
  if (target.role === "admin") {
    assertAdminRemovable(target);
  }
}

/**
 * L'admin racine reste racine : e-mail figé et rôle `admin` conservé. Sinon il
 * s'auto-exclut du provisioning, ou échappe à sa propre garde par renommage.
 */
function assertRootAdminIntact(target: StaffMutationTarget, intent: StaffMutationIntent): void {
  if (!target.isRoot) {
    return;
  }
  if (intent.email.trim().toLowerCase() !== target.email || intent.role !== "admin") {
    throw new ProtectedStaffUserError();
  }
}

/**
 * Deux règles sur les dérogations, et elles gardent la même chose par les deux
 * bouts : **l'annuaire ne s'ouvre ni ne se ferme par un delta**.
 *
 * - Une dérogation ne l'**ouvre** pas à qui son rôle ne l'ouvre pas : obtenir
 *   `staff:write` par écart, c'est pouvoir s'attribuer `admin` dans la foulée,
 *   et le modèle n'a plus de sommet.
 * - Elle ne le **ferme** pas à un administrateur : ce serait contourner « il
 *   reste au moins un admin » par la porte de derrière — l'admin serait là, mais
 *   privé du seul droit qui permet d'en désigner un autre.
 */
function assertOverridesAllowed(intent: StaffMutationIntent): void {
  const opensDirectory = intent.overrides.some(
    (override) => override.resource === "staff" && override.effect === "allow",
  );
  if (opensDirectory) {
    throw new StaffGrantByOverrideError();
  }
  if (intent.role !== "admin") {
    return;
  }
  const effective = resolveStaffPermissions(intent.role, intent.overrides);
  if (!hasStaffPermission(effective, "staff:write")) {
    throw new AdminOverrideRefusedError();
  }
}

/** Vrai si la mutation fait perdre le rôle `admin` à la cible. */
function losesAdmin(target: StaffMutationTarget, nextRole: StaffRole): boolean {
  return target.role === "admin" && nextRole !== "admin";
}

/** Le cœur : on ne retire un administrateur ni à soi-même, ni au dernier. */
function assertAdminRemovable(target: StaffMutationTarget): void {
  if (target.isSelf) {
    throw new SelfDemotionError();
  }
  if (target.otherLivingAdmins === 0) {
    throw new LastStaffAdminError();
  }
}
