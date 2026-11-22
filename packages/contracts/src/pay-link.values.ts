import type { CardCollection } from "./card-collection.js";

/**
 * Les valeurs et les types de **la page publique d'un lien de paiement**,
 * sans zod (la boutique les lit) — le schéma du corps est dans `pay-link.ts`.
 */

/** Le jeton d'un lien : 32 octets en base64url, 43 caractères. */
export const PAY_LINK_TOKEN_LENGTH = 43;

/** Pourquoi la page n'encaisse plus : réglé, ou annulé. */
export type PayLinkUnpayableReason = "settled" | "cancelled";

/**
 * `POST /pay-links/view` → `200`. Aucune ligne de facture, aucune adresse.
 * `404` pour un jeton inconnu ou un lien révoqué, sans distinguer les deux.
 */
export type PayLinkView =
  | {
      readonly payable: true;
      /** Centimes. */
      readonly amountCents: number;
      readonly payeeName: string;
      readonly payerName: string;
      readonly reference: string;
      /** `AAAA-MM-JJ`, ou `null`. */
      readonly dueOn: string | null;
    }
  | { readonly payable: false; readonly reason: PayLinkUnpayableReason };

/**
 * `POST /pay-links/intent` → `200` : comment faire payer, et combien. `404`
 * comme la vue ; `409` `pay_link.subject.not_payable` (réglé, annulé) ou
 * `pay_link.intent.closed` (lien à refaire).
 */
export interface PayLinkIntent {
  readonly collection: CardCollection;
  /** Centimes. */
  readonly amountCents: number;
}
