import type { MailBrandCode } from "../value-objects/mail-brand.js";
import type { MailRefusalCode } from "../value-objects/mail-refusal-code.js";

/** Ce que le contrôle lit d'un envoi : son modèle, son espace, son destinataire. */
export interface MarketingClearanceQuery {
  readonly template: string;
  readonly space: MailBrandCode;
  /** L'adresse à laquelle l'e-mail va partir — la clé se recalcule d'elle, jamais lue rangée. */
  readonly recipient: string;
}

/**
 * Ce qu'un e-mail marketing autorisé emporte, posé par le BLOC (plan de
 * désinscription, B2) : l'adresse de désinscription du pied et de
 * l'en-tête `List-Unsubscribe`.
 */
export interface MarketingMarks {
  readonly unsubscribeUrl: string;
}

/**
 * Le verdict du contrôle (règle 11) : un e-mail transactionnel part sans
 * marque ; un e-mail marketing part avec ses marques, ou est refusé avec sa
 * raison fermée.
 */
export type MarketingVerdict =
  | { readonly kind: "transactional" }
  | { readonly kind: "cleared"; readonly marks: MarketingMarks }
  | { readonly kind: "refused"; readonly code: MailRefusalCode };

/**
 * Port du **contrôle marketing à l'envoi** (plan
 * `documentation/mail/plan-desinscription-des-e-mails.md`, règle 11 et B3) —
 * appelé juste avant l'appel à Resend, par l'essai d'envoi que les trois
 * chemins partagent (immédiat, différé, reprise du balayeur).
 *
 * 🔴 Un e-mail transactionnel ne lit JAMAIS le registre (règle 25).
 *
 * @throws {MailRefusedError} e-mail marketing autorisé, mais sans adresse de
 *   désinscription fabricable (origine de l'espace non configurée) : il ne
 *   part pas sans son pied.
 */
export abstract class MarketingClearance {
  abstract verdictFor(query: MarketingClearanceQuery): Promise<MarketingVerdict>;
}
