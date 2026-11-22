/**
 * **Les états d'un paiement** (plan M2, §3.4) — 🔴 valeurs de l'enum Postgres
 * `card_payment."CardPaymentState"`, elles ne se renomment que par migration.
 *
 * Pas d'état `created` : une intention naît hors transaction, et n'a de ligne
 * qu'une fois rattachée à son sujet.
 */
export const CARD_PAYMENT_STATES = ["pending", "paid", "failed", "closed"] as const;
export type CardPaymentState = (typeof CARD_PAYMENT_STATES)[number];

/** Le rôle d'un paiement pour son sujet — 🔴 valeurs de l'enum `CardPaymentRole`. */
export const CARD_PAYMENT_ROLES = ["first", "complement"] as const;
export type CardPaymentRole = (typeof CARD_PAYMENT_ROLES)[number];

/**
 * **Les six transitions**, et elles seules — la même liste que le
 * déclencheur `card_payment.payment_guard` de la migration
 * `20261109030000_le_schema_de_l_encaissement_par_carte` (vérifié le
 * 2026-11-09). `(x, x)` n'en est pas une : c'est un rejeu sans effet.
 *
 * - `pending → paid` : webhook payé ;
 * - `pending → failed` : webhook refusé ;
 * - `failed → paid` : la carte réessayée sur la même intention ;
 * - `pending → closed`, `failed → closed` : abandon, clôture ;
 * - `closed → paid` : un webhook tardif — le sujet demande le remboursement.
 */
const TRANSITIONS: Readonly<Record<CardPaymentState, readonly CardPaymentState[]>> = {
  pending: ["paid", "failed", "closed"],
  failed: ["paid", "closed"],
  closed: ["paid"],
  paid: [],
};

/** Vrai si `from → to` est l'une des six transitions (jamais `(x, x)`). */
export function isCardPaymentTransition(from: CardPaymentState, to: CardPaymentState): boolean {
  return TRANSITIONS[from].includes(to);
}

/** L'état écrit en base, relu — `null` s'il est inconnu de ce binaire. */
export function cardPaymentStateOf(raw: string): CardPaymentState | null {
  return CARD_PAYMENT_STATES.find((state) => state === raw) ?? null;
}

/** Le rôle écrit en base, relu — `null` s'il est inconnu de ce binaire. */
export function cardPaymentRoleOf(raw: string): CardPaymentRole | null {
  return CARD_PAYMENT_ROLES.find((role) => role === raw) ?? null;
}
