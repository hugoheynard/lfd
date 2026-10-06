import { z } from "zod";

/**
 * **Les destinataires du dossier du jour** (plan
 * `documentation/production/dossier-prod-du-jour.md`, décisions 3-4, lot E2).
 *
 * Réglés dans Production › Réglages, sous `production_settings`. Deux façons
 * d'ajouter : une personne du personnel, choisie dans l'annuaire — son nom et
 * son e-mail se relisent à chaque lecture —, ou une autre personne, saisie.
 *
 * Les charges ne disent que la FORME : une adresse mal formée, un nom vide, un
 * doublon ou une fiche inconnue ou suspendue sont refusés par le domaine
 * (400 / 404 / 409), avec un message qui nomme le cas.
 */

/** `POST …/dossier-recipients` — une personne du personnel. */
export const dossierStaffRecipientPayloadSchema = z.object({
  kind: z.literal("staff"),
  staffUserId: z.string().trim().min(1),
});

/** `POST …/dossier-recipients` — une autre personne. */
export const dossierExternalRecipientPayloadSchema = z.object({
  kind: z.literal("external"),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  jobTitle: z.string().nullish(),
});

export const dossierRecipientPayloadSchema = z.discriminatedUnion("kind", [
  dossierStaffRecipientPayloadSchema,
  dossierExternalRecipientPayloadSchema,
]);
export type DossierRecipientPayload = z.infer<typeof dossierRecipientPayloadSchema>;

export type DossierRecipientKind = "staff" | "external";

/** Un destinataire, résolu : pour le personnel, le nom et l'e-mail d'aujourd'hui. */
export interface DossierRecipientView {
  readonly id: string;
  readonly kind: DossierRecipientKind;
  /** Vide pour une fiche staff qui n'existe plus dans l'annuaire. */
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly jobTitle: string | null;
  readonly staffUserId: string | null;
  /**
   * `true` : la fiche staff est suspendue ou n'existe plus — elle ne recevra
   * rien tant qu'elle l'est. Absent pour un externe.
   */
  readonly inactive?: boolean;
}

/** `GET …/dossier-recipients/staff-candidates` — le personnel qu'on peut choisir. */
export interface DossierStaffCandidateView {
  readonly staffUserId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly jobTitle: string | null;
}
