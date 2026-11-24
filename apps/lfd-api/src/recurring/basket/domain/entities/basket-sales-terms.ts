import type { IsoDate } from "../value-objects/iso-date.js";

/**
 * **Une version des CGV** que le panier applique : le texte (`key`, celui de
 * la clientèle), sa révision et son PDF — les colonnes d'une commande.
 */
export interface BasketSalesTermsVersion {
  readonly key: string;
  readonly revision: number;
  readonly fileId: string | null;
}

/** Le préavis d'une nouvelle version des CGV : 30 jours après l'envoi (plan § 7, Q-B2). */
export const SALES_TERMS_NOTICE_DAYS = 30;

/** Une nouvelle version publiée, telle qu'un panier l'apprend. */
export interface PublishedSalesTerms {
  readonly revision: number;
  readonly fileId: string | null;
}

/** La version annoncée et le jour où elle s'applique (envoi + 30 jours, plan § 7). */
export interface AnnouncedSalesTerms {
  readonly revision: number;
  readonly fileId: string | null;
  readonly effectiveOn: IsoDate;
}
