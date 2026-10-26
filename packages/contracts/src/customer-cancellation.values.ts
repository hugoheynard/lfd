import type { CustomerOrderView, OrderStatus } from "./order.js";
import type { OrderRevisability } from "./order-revision.values.js";

/**
 * **L'annulation par le client**, sans zod (doc
 * `documentation/commandes/annulation/annulation-par-le-client.md`, lot C6).
 *
 * Séparé de `customer-cancellation.ts` pour la raison de poids de
 * `order-opening.values.ts` : la boutique lit ces valeurs, et le baril
 * embarquerait zod dans son bundle initial.
 */

/**
 * Les motifs qu'un client peut choisir (Q-C6.1) — facultatifs. 🔴 Valeurs
 * écrites en base (`orders.cancellation_reason_code`, CHECK) : irréversibles.
 */
export const CUSTOMER_CANCELLATION_REASON_CODES = [
  "no_longer_needed",
  "wrong_date",
  "wrong_products",
  "other",
] as const;
export type CustomerCancellationReasonCode = (typeof CUSTOMER_CANCELLATION_REASON_CODES)[number];

/** Assez pour une phrase, pas pour une lettre — la borne du motif staff. */
export const CUSTOMER_CANCELLATION_REASON_MAX_LENGTH = 500;

/**
 * Pourquoi un client ne peut pas annuler — le suffixe des codes
 * `orders.customer_cancel.*` (C6.7). Le front dit la phrase d'après le code ;
 * le serveur la porte aussi dans `message`.
 */
export const CUSTOMER_CANCELLATION_REFUSALS = [
  "already_cancelled",
  "in_preparation",
  "ready",
  "fulfilled",
  /** Plan E7 reliquat (L5a) : une partie est retirée, le reste ne l'est pas. */
  "partially_handed_over",
  "too_late",
  "payment_in_progress",
  "paid_just_now",
  "not_recorded",
  "invoiced",
  "voucher_reused",
  "account_required",
  "account_disabled",
  /**
   * La commande se VOIT mais ne s'annule pas depuis ce compte — invitation
   * pas encore acceptée, société suspendue (C6.2, B2). Le bouton disparaît ;
   * le `POST`, lui, répond `404`.
   */
  "not_allowed",
] as const;
export type CustomerCancellationRefusal = (typeof CUSTOMER_CANCELLATION_REFUSALS)[number];

/** Le préfixe des codes de refus client — `orders.customer_cancel.<refus>`. */
export const CUSTOMER_CANCEL_CODE_PREFIX = "orders.customer_cancel.";

/**
 * Ce que l'annulation fera de l'argent, dit au client avant qu'il confirme
 * (C6.8) : rien de prélevé (carte non payée, ou total nul), remboursé sur la
 * carte, rien ne sera facturé (au compte).
 */
export type CustomerCancellationMoney =
  | { readonly kind: "nothing_charged" }
  | { readonly kind: "refund"; readonly amountCents: number }
  | { readonly kind: "account" };

/**
 * **La commande peut-elle être annulée par ce client, maintenant ?** Calculée
 * sans verrou par la même règle que le geste : une indication, pas une
 * promesse — le `POST` relit tout sous verrou.
 *
 * `until` : l'instant ISO jusqu'auquel un particulier peut annuler (le délai du
 * réglage), `null` pour un pro. `voucherReturned` : la commande porte un bon,
 * qui reviendra. Refusée, `until` dit l'échéance passée pour `too_late`.
 */
export type OrderCancellability =
  | {
      readonly cancellable: true;
      readonly until: string | null;
      readonly money: CustomerCancellationMoney;
      readonly voucherReturned: boolean;
    }
  | {
      readonly cancellable: false;
      readonly code: CustomerCancellationRefusal;
      readonly until: string | null;
    };

/**
 * **La page d'annulation de l'invité** (C6.4) — le strict nécessaire, converti
 * explicitement : ni nom de famille, ni adresse, ni téléphone, ni courriel, ni
 * jeton de retrait. Le prénom seul, en salutation ; la ville seule pour une
 * livraison.
 */
export interface GuestOrderCancellationView {
  readonly orderNumber: string;
  readonly firstName: string;
  /** `AAAA-MM-JJ`, ou `null` : commande sans jour. */
  readonly requestedFor: string | null;
  readonly fulfillment:
    | { readonly method: "pickup"; readonly pickupLabel: string | null }
    | { readonly method: "delivery"; readonly city: string | null };
  readonly lines: readonly { readonly name: string; readonly quantity: number }[];
  readonly totalCents: number;
  readonly status: OrderStatus;
  readonly cancellability: OrderCancellability;
}

/**
 * **Jusqu'où un particulier peut annuler** sa commande (plan
 * `documentation/commandes/annulation/plan-a1-retirer-une-commande-inscrite.md`,
 * décision C7 § 2) : jusqu'à l'arrêt du plan de production, ou jusqu'à ce que
 * la commande soit prête. 🔴 Valeurs d'un enum Postgres : irréversibles.
 * `handover` n'y entre pas (Hugo, 2026-10-25).
 */
export const CUSTOMER_CANCELLATION_STAGES = ["production_plan", "ready"] as const;
export type CustomerCancellationStage = (typeof CUSTOMER_CANCELLATION_STAGES)[number];

/**
 * Le réglage « Réglages › Commandes » (C6.5). `delayEnabled` : un délai est
 * imposé aux particuliers — actif par défaut (décision de Hugo du
 * 2026-10-13) ; désactivé, seul l'arrêt du plan de production limite, comme
 * pour un pro. `hoursBefore` est le délai avant le retrait / la livraison.
 */
export interface CustomerCancellationSettingsView {
  readonly delayEnabled: boolean;
  readonly hoursBefore: number;
  /** Jusqu'où un particulier peut annuler (plan A1) ; `production_plan` par défaut. */
  readonly b2cCancellableUntil: CustomerCancellationStage;
  /** Instant du dernier geste ; `null` tant que personne n'a rien réglé. */
  readonly updatedAt: string | null;
  readonly updatedBy: string | null;
}

/** Le réglage tant que personne ne l'a posé : délai actif, 24 h. */
export const DEFAULT_CUSTOMER_CANCELLATION_SETTINGS: CustomerCancellationSettingsView = {
  delayEnabled: true,
  hoursBefore: 24,
  b2cCancellableUntil: "production_plan",
  updatedAt: null,
  updatedBy: null,
};

/** La borne du délai, tenue aussi par un CHECK en base : une semaine au plus. */
export const CUSTOMER_CANCELLATION_MAX_HOURS_BEFORE = 168;

/**
 * `GET /orders/:id` côté client : la commande, si elle s'annule (C6.8), et
 * depuis le 2026-10-23 si elle se modifie et sa révision courante (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, §6).
 */
export type CustomerOrderDetailView = CustomerOrderView & {
  readonly cancellability: OrderCancellability;
  readonly revisability: OrderRevisability;
  /** La révision courante : `0` à la passation, `+1` à chaque modification. */
  readonly revision: number;
};
