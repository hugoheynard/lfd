import {
  hasStaffPermission,
  resolvePermissionsFromGrants,
  type RoleGrants,
  type StaffOverride,
  type StaffStatus,
} from "@lfd/contracts";

import {
  AdminOverrideRefusedError,
  LastStaffAdminError,
  RescueOverridesLockedError,
  ProtectedStaffUserError,
  SelfDemotionError,
  StaffGrantByOverrideError,
} from "../directory/domain/staff-user-errors.js";

/**
 * Les garde-fous qui rendent **impossible de se verrouiller dehors**.
 *
 * Un système de permissions a une façon spectaculaire d'échouer : fonctionner
 * parfaitement, et enfermer tout le monde à l'extérieur. Ces règles vivent ici —
 * dans le domaine, pas dans un écran, qui n'est qu'une suggestion — et elles se
 * testent sans base ni HTTP.
 *
 * 🔴 **Elles tiennent sur le DROIT, plus sur la chaîne `"admin"`** (plan
 * `documentation/staff/plan-roles-lus-en-base.md` §3.3). Depuis que les rôles se
 * lisent en base, `admin` s'édite : tester son nom ne garantit plus rien. Les
 * deux invariants deviennent :
 *
 * - il reste au moins une personne active qui tient `staff_access:write` **par
 *   son rôle**, la fiche de secours mise à part ;
 * - on ne se retire pas `staff_access:write` à soi-même.
 *
 * Le versant « éditer un rôle » vit dans `StaffRoleDefinition.redefine`.
 *
 * Modèle complet : `documentation/staff/architecture-acces-staff.md` §6.
 */

/** Le droit que les invariants protègent : celui de désigner qui a quels droits. */
export const DIRECTORY_WRITE = "staff_access:write";

/** Vrai si ces droits de rôle, avec ces écarts, tiennent l'annuaire en écriture. */
export function keepsDirectory(grants: RoleGrants, overrides: readonly StaffOverride[]): boolean {
  return hasStaffPermission(resolvePermissionsFromGrants(grants, overrides), DIRECTORY_WRITE);
}

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
  /** La clé du rôle porté aujourd'hui. */
  readonly roleKey: string | null;
  /** Les écarts en base — la fiche de secours ne doit pas les voir changer. */
  readonly currentOverrides: readonly StaffOverride[];
  /**
   * Vrai si la cible, non suspendue, tient aujourd'hui `staff_access:write` par
   * son rôle — c'est-à-dire si la perdre retirerait un recours.
   */
  readonly keepsDirectory: boolean;
  /**
   * Combien d'**autres** personnes tiennent l'annuaire par leur rôle, non
   * suspendues, la fiche de secours exclue. On ne compte pas les seuls
   * `active` : quelqu'un qui n'a jamais ouvert sa session reste un recours
   * valide, il lui suffit de se connecter.
   */
  readonly otherDirectoryKeepers: number;
  /**
   * Vrai si l'auteur de la mutation est la personne visée — comparé par **id de
   * fiche** depuis le 2026-09-18 (l'auteur arrive par `@StaffUserId()`, plus par
   * son `sub`), donc vrai même pour une fiche jamais liée à une identité.
   */
  readonly isSelf: boolean;
}

/** Ce que la mutation veut écrire — le rôle visé, déjà lu dans sa définition active. */
export interface StaffMutationIntent {
  readonly email: string;
  readonly roleKey: string;
  readonly roleGrants: RoleGrants;
  readonly overrides: readonly StaffOverride[];
}

/**
 * Autorise (ou refuse) une **édition** de fiche.
 *
 * @throws {ProtectedStaffUserError} la cible est la fiche racine et la mutation
 *   la renommerait ou lui changerait de rôle.
 * @throws {RescueOverridesLockedError} la cible est la fiche racine et ses écarts changeraient.
 * @throws {StaffGrantByOverrideError} un écart ouvrirait l'annuaire.
 * @throws {AdminOverrideRefusedError} un écart fermerait l'annuaire que le rôle ouvre.
 * @throws {SelfDemotionError} l'auteur se retire `staff_access:write`.
 * @throws {LastStaffAdminError} plus personne ne tiendrait l'annuaire par son rôle.
 */
export function assertEditAllowed(target: StaffMutationTarget, intent: StaffMutationIntent): void {
  assertRootIntact(target, intent);
  assertOverridesAllowed(intent);
  if (target.keepsDirectory && !keepsDirectory(intent.roleGrants, intent.overrides)) {
    assertKeeperRemovable(target);
  }
}

/**
 * Autorise (ou refuse) un changement d'**état de connexion**. Seule la suspension
 * retire un accès ; les autres transitions se constatent et ne menacent personne.
 *
 * @throws {ProtectedStaffUserError} la cible est la fiche racine.
 * @throws {SelfDemotionError} l'auteur se suspend lui-même alors qu'il tient l'annuaire.
 * @throws {LastStaffAdminError} suspendre laisserait l'annuaire sans personne pour le tenir.
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
  if (target.keepsDirectory) {
    assertKeeperRemovable(target);
  }
}

/**
 * La fiche racine reste ce qu'elle est : e-mail figé, rôle inchangé. C'est
 * l'e-mail qui la désigne comme secours (§3.4) — le changer serait le chemin en
 * deux temps vers sa disparition.
 */
function assertRootIntact(target: StaffMutationTarget, intent: StaffMutationIntent): void {
  if (!target.isRoot) {
    return;
  }
  if (intent.email.trim().toLowerCase() !== target.email || intent.roleKey !== target.roleKey) {
    throw new ProtectedStaffUserError();
  }
  // Le rôle et l'adresse étaient déjà gardés ; les écarts ne l'étaient pas
  // (vérifié le 2026-09-26), alors que `superadmin` les ignore.
  if (overridesKey(intent.overrides) !== overridesKey(target.currentOverrides)) {
    throw new RescueOverridesLockedError();
  }
}

/** Une forme comparable d'un jeu d'écarts, indépendante de l'ordre. */
function overridesKey(overrides: readonly StaffOverride[]): string {
  return overrides
    .map((entry) => `${entry.resource}:${entry.action}:${entry.effect}`)
    .sort()
    .join("|");
}

/**
 * Deux règles sur les dérogations, et elles gardent la même chose par les deux
 * bouts : **l'annuaire ne s'ouvre ni ne se ferme par un delta**.
 *
 * - Une dérogation ne l'**ouvre** pas à qui son rôle ne l'ouvre pas : obtenir
 *   `staff_access:write` par écart, c'est pouvoir s'attribuer n'importe quel
 *   rôle dans la foulée, et le modèle n'a plus de sommet.
 * - Elle ne le **ferme** pas à qui son rôle l'ouvre : ce serait contourner « il
 *   reste au moins un recours » par la porte de derrière.
 */
function assertOverridesAllowed(intent: StaffMutationIntent): void {
  const opensDirectory = intent.overrides.some(
    (override) => override.resource === "staff_access" && override.effect === "allow",
  );
  if (opensDirectory) {
    throw new StaffGrantByOverrideError();
  }
  if (
    keepsDirectory(intent.roleGrants, []) &&
    !keepsDirectory(intent.roleGrants, intent.overrides)
  ) {
    throw new AdminOverrideRefusedError();
  }
}

/** Le cœur : on ne retire l'annuaire ni à soi-même, ni au dernier qui le tient. */
function assertKeeperRemovable(target: StaffMutationTarget): void {
  if (target.isSelf) {
    throw new SelfDemotionError();
  }
  if (target.otherDirectoryKeepers === 0) {
    throw new LastStaffAdminError();
  }
}
