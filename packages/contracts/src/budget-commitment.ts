import { z } from "zod";

import type { CommitmentTiming } from "./chorus-routing.js";
import type { CurrentCommitmentView } from "./chorus-service.js";

/**
 * **L'engagement budgétaire** d'un organisme public (plan
 * `documentation/comptabilite/facturation/plan-clients-publics-chorus.md`,
 * § 6 quater) : le numéro d'engagement de son bon de commande (BT-13 de la
 * facture) et son code service Chorus (BT-10).
 *
 * Le schéma ne tient que la FORME (deux textes). Ce qui fait un numéro
 * valable (1 à 50 caractères imprimables) et qui doit en porter un — le
 * payeur public dont la fiche Chorus l'exige — se juge au serveur.
 *
 * Une chaîne vide dit « rien saisi » : un code service vide prend le code par
 * défaut de la fiche Chorus du payeur.
 */
export const budgetCommitmentPayloadSchema = z.object({
  number: z.string("numéro d'engagement : un texte"),
  serviceCode: z.string("code service : un texte"),
});
export type BudgetCommitmentPayload = z.infer<typeof budgetCommitmentPayloadSchema>;

/**
 * La correction de l'engagement d'une commande par le staff
 * (`PUT /admin/orders/:orderId/budget-commitment`), tant qu'elle n'est pas
 * facturée. `null` retire l'engagement — refusé si le payeur l'exige.
 */
export const correctBudgetCommitmentPayloadSchema = z.object({
  budgetCommitment: budgetCommitmentPayloadSchema.nullable(),
});
export type CorrectBudgetCommitmentPayload = z.infer<typeof correctBudgetCommitmentPayloadSchema>;

/** L'engagement porté par une commande ou une facture. */
export interface BudgetCommitmentView {
  /** Vide quand seul le code service est porté. */
  readonly number: string;
  /** Vide quand aucun code service n'est porté. */
  readonly serviceCode: string;
}

/**
 * **Ce que le payeur d'une commande exige**, pour l'écran de passation
 * (`GET /me/budget-commitment-requirements` pour la société active du client,
 * `GET /admin/companies/:companyId/budget-commitment-requirements` pour la
 * saisie de l'équipe). Le payeur est celui que la passation retiendrait : le
 * principal d'un site qui en suit la facturation ; `null` sans société.
 *
 * `publicPayer: false` : le champ ne s'affiche pas, et le serveur refuse un
 * engagement envoyé.
 */
export interface BudgetCommitmentRequirementsView {
  readonly payerCompanyId: string | null;
  readonly publicPayer: boolean;
  readonly commitmentRequired: boolean;
  readonly serviceCodeRequired: boolean;
  /**
   * Le moment de l'engagement du payeur. En `on_period_quote`, l'écran masque
   * le champ numéro (il arrive sur le devis de la période) et n'en envoie
   * aucun ; le code service reste. `at_order` pour un payeur privé.
   */
  readonly timing: CommitmentTiming;
  /**
   * Le code proposé dans le champ : celui de la fiche du service de la
   * société qui commande, sinon celui de la fiche Chorus du payeur ; vide
   * quand aucune n'en donne.
   */
  readonly defaultServiceCode: string;
  /**
   * L'engagement en cours de la société qui commande, ou `null`. Servi sans
   * filtre de date : l'écran le propose quand la livraison choisie tombe au
   * plus tard `endsOn`, et le dit expiré au-delà. Proposé, jamais imposé.
   * Toujours `null` en `on_period_quote` : rien n'est prérempli.
   */
  readonly currentCommitment: CurrentCommitmentView | null;
}

/**
 * Les codes des refus de l'engagement (`AppError.code`), pour que l'écran
 * place le message sous le bon champ.
 */
export const BUDGET_COMMITMENT_ERRORS = {
  /** 400 — numéro vide, trop long, espaces en tête ou en queue, caractère non imprimable. */
  invalid: "budget_commitment.invalid",
  /** 409 — le payeur exige un numéro d'engagement et la commande n'en porte pas. */
  numberRequired: "budget_commitment.number_required",
  /** 409 — le payeur exige un code service, aucun n'est saisi ni proposé par défaut. */
  serviceCodeRequired: "budget_commitment.service_code_required",
  /** 409 — un payeur privé : il n'a pas d'engagement budgétaire. */
  privatePayer: "budget_commitment.private_payer",
  /** 400 — un numéro saisi pour un payeur dont l'engagement arrive sur le devis de période. */
  onQuote: "budget_commitment.on_quote",
  /** 409 — la commande est déjà facturée (ou engagée en comptabilité) : la comptabilité décide. */
  alreadyInvoiced: "budget_commitment.already_invoiced",
} as const;

/**
 * Le code du refus d'un article hors du tarif convenu (`AppError.code`) : un
 * payeur sur devis de période ne commande que ce que sa mercuriale cite.
 */
export const NEGOTIATED_SCOPE_ERRORS = {
  /** 409 — l'article n'est pas cité par la mercuriale active du payeur au jour de livraison. */
  outsideScope: "negotiated_scope.outside_scope",
  /** 400 — le jour de livraison n'est pas une date lisible. */
  invalidDay: "negotiated_scope.invalid_day",
} as const;
