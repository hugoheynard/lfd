import { z } from "zod";

/**
 * **Comment un payeur au compte règle** (plan
 * `documentation/comptabilite/le-paiement-par-virement.md`, V1) :
 * par prélèvement SEPA, ou par virement à réception de facture. Des VALEURS :
 * elles vivent en base, elles ne se renomment que par migration.
 */
export const COLLECTION_MEANS = ["sepa_debit", "bank_transfer"] as const;

export const collectionMeansSchema = z.enum(COLLECTION_MEANS);
export type CollectionMeansName = z.infer<typeof collectionMeansSchema>;

/** La longueur d'un motif de changement : une phrase, pas une note. */
export const COLLECTION_MEANS_REASON_MAX = 500;

/**
 * Changer le moyen d'un payeur (`PUT …/payers/:companyId/collection-means`).
 * Le motif est une FORME ici (texte) ; le domaine refuse un motif vide.
 */
export const setPayerCollectionMeansPayloadSchema = z.strictObject({
  means: collectionMeansSchema,
  reason: z.string().max(COLLECTION_MEANS_REASON_MAX),
});
export type SetPayerCollectionMeansPayload = z.infer<typeof setPayerCollectionMeansPayloadSchema>;

/**
 * Le moyen d'encaissement d'un compte chez une entité. Un site qui suit la
 * facturation de son principal lit celui du principal (`payerCompanyId` est
 * alors le principal, `followsPayer` le nomme).
 */
export interface PayerCollectionMeansView {
  readonly legalEntityId: string;
  /** Le compte demandé. */
  readonly companyId: string;
  /** Le payeur dont le moyen fait foi : le compte, ou son principal. */
  readonly payerCompanyId: string;
  /** Le principal que ce site suit en facturation ; `null` : le compte règle seul. */
  readonly followsPayer: { readonly id: string; readonly name: string } | null;
  readonly means: CollectionMeansName;
  /** ISO — depuis quand ; `null` = prélèvement par défaut, jamais changé. */
  readonly since: string | null;
  readonly scheduled: {
    readonly means: CollectionMeansName;
    /** ISO — la clôture du payeur où il prend effet. */
    readonly effectiveAt: string;
    readonly reason: string;
  } | null;
}

/**
 * `GET companies/:companyId/collection-means` — comment le compte règle au
 * compte, pour l'espace client : la boutique dit « par virement à réception
 * de facture » et retire l'espace mandat au virement. Un site qui suit la
 * facturation de son principal lit celui du principal. Jamais d'IBAN : les
 * coordonnées ne sont que sur la facture.
 */
export interface MyCollectionMeansView {
  readonly means: CollectionMeansName;
}
