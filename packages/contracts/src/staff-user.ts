import { z } from "zod";

import {
  staffOverrideSchema,
  staffRoleSchema,
  type StaffOverride,
  type StaffPermission,
  type StaffRole,
} from "./staff-access.js";

/**
 * Contrat de fil des **utilisateurs staff** (back-office) — l'annuaire des
 * personnes qui opèrent la suite. Source de vérité **locale** (pas Auth0), qui
 * porte l'identité, le **rôle** et ses **dérogations** (voir `staff-access.ts`
 * pour le modèle d'autorisation lui-même).
 */

/**
 * Où en est la personne vis-à-vis de sa **connexion**. L'ordre naturel est fiche
 * d'abord, compte ensuite : on saisit l'arrivante de lundi avant qu'elle n'ait un
 * mot de passe.
 *
 * - `pending` — fiche créée, aucune invitation encore envoyée ;
 * - `invited` — lien envoyé, jamais utilisé ;
 * - `active` — entrée **constatée** (l'identité Auth0 est liée) ;
 * - `suspended` — départ : ferme tout, immédiatement, sans rien détruire.
 */
export const staffStatusSchema = z.enum(["pending", "invited", "active", "suspended"]);
export type StaffStatus = z.infer<typeof staffStatusSchema>;

export const STAFF_STATUS_LABELS: Readonly<Record<StaffStatus, string>> = {
  pending: "Sans compte",
  invited: "Invitée",
  active: "Active",
  suspended: "Suspendue",
};

/**
 * Charge de création/édition : identité + rôle + dérogations.
 *
 * Ni `status` ni la liaison Auth0 n'y figurent : ils se **constatent** (première
 * connexion) ou se demandent par un geste dédié (inviter, suspendre) — jamais en
 * enregistrant un formulaire d'identité.
 */
export const staffUserPayloadSchema = z.object({
  firstName: z.string().trim().min(1, "prénom requis"),
  lastName: z.string().trim().min(1, "nom requis"),
  email: z.string().trim().min(1, "e-mail requis").email("e-mail invalide"),
  // Facultatifs : un annuaire à moitié rempli reste un annuaire utile.
  phone: z.string().trim().default(""),
  jobTitle: z.string().trim().default(""),
  role: staffRoleSchema,
  // Les écarts au rôle, et eux seuls — l'absence de ligne vaut « hérite ».
  overrides: z.array(staffOverrideSchema).default([]),
});
export type StaffUserPayload = z.infer<typeof staffUserPayloadSchema>;

/**
 * Un user staff tel que renvoyé (trié par nom).
 *
 * `permissions` est l'**effectif** — rôle et dérogations déjà combinés par le
 * serveur. L'écran affiche ce qu'on lui donne au lieu de rejouer la formule :
 * deux implémentations de la même règle divergent toujours.
 */
export interface StaffUserView {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string;
  readonly jobTitle: string;
  readonly role: StaffRole;
  readonly status: StaffStatus;
  /**
   * Quand le dernier lien d'invitation a été émis (ISO), `null` si jamais.
   * Ré-inviter l'écrase : émettre un ticket tue le précédent.
   */
  readonly invitedAt: string | null;
  /**
   * L'invitation est-elle **périmée** ? Calculée par le **serveur**, à la
   * lecture.
   *
   * Elle pourrait se déduire de `invitedAt` côté écran — et c'est précisément
   * ce qu'il ne faut pas faire : le nombre de jours est une règle, pas une
   * constante d'affichage. Écrite dans le front, elle divergerait le jour où on
   * la change, et l'écran annoncerait un accès encore ouvert que le serveur a
   * déjà cessé d'honorer.
   *
   * Toujours `false` hors du statut `invited` : un compte actif n'a pas
   * d'invitation à périmer.
   */
  readonly invitationExpired: boolean;
  readonly overrides: readonly StaffOverride[];
  readonly permissions: readonly StaffPermission[];
}

/**
 * La seule transition d'état qui se **demande**. `pending` et `invited` se
 * constatent (création, invitation), `active` aussi (première connexion) : seul
 * le couple suspendre / réintégrer est un geste délibéré.
 */
export const staffStatusChangeSchema = z.object({
  status: z.enum(["active", "suspended"]),
});
export type StaffStatusChange = z.infer<typeof staffStatusChangeSchema>;

/** Réponse de création d'un user staff. */
export interface CreatedStaffUserResponse {
  readonly id: string;
}
