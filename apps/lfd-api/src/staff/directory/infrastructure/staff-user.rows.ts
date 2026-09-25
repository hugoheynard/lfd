import type { StaffOverride, StaffStatus, StaffUserPayload, StaffUserView } from "@lfd/contracts";

import { isInvitationExpired } from "../../../platform/shared/invitation/invitation-expiry.js";
import {
  HELD_ROLE_SELECT,
  heldRoleKey,
  heldRoleLabel,
  isRescueFiche,
  resolveHeldRole,
  type HeldRoleRow,
  type UnreadableGrantsReporter,
} from "../../permissions/infrastructure/held-role.js";
import type { StaffMutationTarget } from "../../permissions/staff-access.policy.js";
import type { StaffUserIdentity, StaffUserSnapshot } from "../domain/staff-user-state.js";

/**
 * Les **formes de ligne** de l'annuaire et leurs conversions pures — sorties
 * de l'adaptateur pour qu'il ne porte que la persistance. Aucune n'est
 * exportée hors de `infrastructure/`.
 */

export interface OverrideRow {
  readonly resource: StaffOverride["resource"];
  readonly action: StaffOverride["action"];
  readonly effect: StaffOverride["effect"];
}

export interface StaffRow extends HeldRoleRow {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string;
  readonly jobTitle: string;
  readonly status: StaffStatus;
  readonly invitedAt: Date | null;
  readonly overrides: readonly OverrideRow[];
}

export const SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  jobTitle: true,
  ...HELD_ROLE_SELECT,
  status: true,
  invitedAt: true,
  overrides: { select: { resource: true, action: true, effect: true } },
} as const;

/**
 * La vue porte l'**effectif** déjà résolu : l'écran affiche ce qu'on lui donne au
 * lieu de rejouer la formule — d'où `resolveHeldRole`, la même fonction que le
 * guard.
 *
 * La fiche de secours (§3.4) montre son rôle EFFECTIF, `superadmin`, et
 * `isRescue` : afficher la clé écrite (« Administrateur ») mentirait sur ce
 * qu'elle peut faire. Son rôle et ses écarts ne se modifient pas (politique).
 */
export function toView(
  row: StaffRow,
  now: Date,
  rescueEmail: string,
  report: UnreadableGrantsReporter,
): StaffUserView {
  const overrides = row.overrides.map((entry) => ({ ...entry }));
  const isRescue = isRescueFiche(row.email, rescueEmail);
  const effective = resolveHeldRole(row, overrides, isRescue, report);
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    jobTitle: row.jobTitle,
    role: isRescue ? effective.key : (heldRoleKey(row) ?? ""),
    roleLabel: isRescue ? effective.label : heldRoleLabel(row),
    isRescue,
    status: row.status,
    invitedAt: row.invitedAt?.toISOString() ?? null,
    // La péremption ne vaut que pour une invitation en attente : une fois
    // entrée, la personne n'a plus de lien à réclamer, et un « invitation
    // expirée » sur un compte actif serait une alarme mensongère.
    invitationExpired:
      row.status === "invited" && row.invitedAt !== null && isInvitationExpired(row.invitedAt, now),
    overrides,
    permissions: effective.permissions,
  };
}

/** E-mail normalisé (clé d'unicité) : trimé (zod) + minuscule. */
function normalizeEmail(email: string): string {
  return email.toLowerCase();
}

/** Colonnes d'identité d'une charge. Les dérogations vivent dans leur table. */
export function identityColumns(payload: StaffUserPayload): StaffUserIdentity {
  return {
    firstName: payload.firstName,
    lastName: payload.lastName,
    email: normalizeEmail(payload.email),
    phone: payload.phone,
    jobTitle: payload.jobTitle,
    role: payload.role.trim().toLowerCase(),
  };
}

/** Les colonnes de l'état d'avant — ce que les faits du journal comparent. */
export const SNAPSHOT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  jobTitle: true,
  ...HELD_ROLE_SELECT,
  status: true,
  auth0Id: true,
} as const;

/** L'état d'avant, et ce que la politique de domaine doit savoir de la cible. */
export interface LoadedTarget {
  readonly snapshot: StaffUserSnapshot;
  readonly overrides: readonly OverrideRow[];
  /** Le libellé du rôle d'avant, lu dans sa définition — pour le journal. */
  readonly roleLabel: string;
  readonly policy: StaffMutationTarget;
}

/** Vrai si aucune colonne d'identité ne bouge — l'`UPDATE` serait alors vide. */
export function sameIdentity(before: StaffUserIdentity, after: StaffUserIdentity): boolean {
  return (
    before.firstName === after.firstName &&
    before.lastName === after.lastName &&
    before.email === after.email &&
    before.phone === after.phone &&
    before.jobTitle === after.jobTitle &&
    before.role === after.role
  );
}
