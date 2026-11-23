import { z } from "zod";

import type { StaffActorView } from "./admin-company.js";

const DAY = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * **La fiche du service Chorus** d'une société qui commande — le sous-compte
 * d'une unité sous un SIRET de facturation partagé, ou un compte public seul :
 * son code service, et l'engagement en cours qui préremplit ses commandes.
 * Posée par le staff à réception du bon (`PUT
 * /admin/companies/:companyId/chorus-service`), réécrite en entier ; retirer
 * l'engagement, c'est la reposer sans numéro.
 *
 * Le schéma ne tient que la FORME. Ce qui fait une fiche valable — un numéro
 * de 1 à 50 caractères imprimables, un numéro et une date de fin qui vont
 * ensemble, un payeur public, pas de code sur un payeur seul — se juge au
 * serveur.
 *
 * Doc : `documentation/comptabilite/facturation/plan-clients-publics-chorus.md`, § 6 octies.
 */
export const chorusServicePayloadSchema = z.object({
  /** Le code service de l'unité ; vide : celui de la fiche Chorus du payeur. */
  serviceCode: z.string("code service : un texte"),
  /** Le numéro d'engagement du bon en cours ; vide : aucun engagement en cours. */
  commitmentNumber: z.string("numéro d'engagement : un texte"),
  /** Le dernier jour de validité du bon, `AAAA-MM-JJ` ; `null` sans engagement. */
  commitmentEndsOn: z
    .string()
    .regex(DAY, "date de fin de l'engagement attendue au format AAAA-MM-JJ")
    .nullable(),
});
export type ChorusServicePayload = z.infer<typeof chorusServicePayloadSchema>;

/** L'engagement en cours d'une société qui commande. */
export interface CurrentCommitmentView {
  readonly number: string;
  /** Le dernier jour de validité, `AAAA-MM-JJ`. */
  readonly endsOn: string;
}

/** La fiche du service Chorus telle que la fiche staff la montre. */
export interface ChorusServiceView {
  /**
   * Le payeur au moment du geste. Quand il n'est plus celui de la société, la
   * fiche ne propose plus rien à la commande.
   */
  readonly payerCompanyId: string;
  /** Vide : le code de la fiche Chorus du payeur s'applique. */
  readonly serviceCode: string;
  readonly currentCommitment: CurrentCommitmentView | null;
  /** Instant ISO du geste. */
  readonly recordedAt: string;
  /** L'agent qui a posé la fiche, tel que figé ce jour-là. */
  readonly recordedBy: StaffActorView;
}

/** Les codes des refus de la fiche (`AppError.code`). */
export const CHORUS_SERVICE_ERRORS = {
  /** 400 — numéro trop long ou non imprimable, numéro sans date de fin ou date sans numéro. */
  invalid: "account.chorus_service.invalid",
  /** 409 — le payeur de la société n'est pas un organisme public. */
  payerNotPublic: "account.chorus_service.payer_not_public",
  /** 409 — la société est son propre payeur : le code service est celui de sa fiche Chorus. */
  serviceCodeOnSolePayer: "account.chorus_service.service_code_on_sole_payer",
} as const;
