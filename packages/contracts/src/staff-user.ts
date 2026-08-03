import { z } from "zod";

/**
 * Contrat de fil des **utilisateurs staff** (back-office) — l'annuaire des
 * personnes qui opèrent la suite. Source de vérité **locale** (pas Auth0) ; le
 * provisioning de connexion est différé. Le backend valide ces schémas à sa
 * frontière ; les frontends en dérivent leurs types.
 */

/** Un domaine du back-office accessible à un user staff. Aligné sur `StaffScope` (Prisma). */
export const staffScopeSchema = z.enum(["commercial", "comptabilite", "admin"]);
export type StaffScope = z.infer<typeof staffScopeSchema>;

/** Charge de création/édition d'un user staff : identité + périmètre. */
export const staffUserPayloadSchema = z.object({
  firstName: z.string().trim().min(1, "prénom requis"),
  lastName: z.string().trim().min(1, "nom requis"),
  email: z.string().trim().min(1, "e-mail requis").email("e-mail invalide"),
  // Le périmètre : ensemble (sans doublon) de domaines. Vide = aucun accès.
  scopes: z.array(staffScopeSchema).default([]),
});
export type StaffUserPayload = z.infer<typeof staffUserPayloadSchema>;

/** Un user staff tel que renvoyé (trié par nom). */
export interface StaffUserView {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly scopes: readonly StaffScope[];
}

/** Réponse de création d'un user staff. */
export interface CreatedStaffUserResponse {
  readonly id: string;
}
