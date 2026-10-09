/**
 * **Le règlement d'une commande, sans zod** — lu par la boutique (via
 * `@lfd/contracts/shop-values`), la vue client et le commerce.
 *
 * Hors de `order.ts` parce que ce module importe zod : une valeur prise au
 * baril ramène zod dans le bundle initial de la boutique (cf. `shop-values.ts`).
 * Ce fichier n'importe que des types.
 */
import type { PaymentStatus } from "./order.js";

/**
 * **Une commande est-elle réglée ?** — `paid` (encaissée) ou `not_required`
 * (au compte, ou gratuite). La seule définition du dépôt
 * (`documentation/order/plan-carte-reglee-avant-tout.md`, §1, §4.3) : le suivi
 * du client, la vue client, le comptoir et le bon la lisent tous.
 *
 * `pending` et `failed` ne le sont pas : la carte n'a pas abouti. `refunded`
 * (remboursée en entier) non plus — elle n'a ni suivi ni QR ; une commande déjà
 * retirée n'est pas concernée, le retrait a eu lieu.
 */
export function isSettled(paymentStatus: PaymentStatus): boolean {
  return paymentStatus === "paid" || paymentStatus === "not_required";
}

/**
 * **Le jeton de retrait qu'on a le droit de MONTRER** — au client, sur un bon,
 * dans un courriel : le jeton si la commande est réglée, `null` sinon.
 *
 * 🔴 Le jeton est émis à la passation (`issuesHandoverToken`), donc AVANT le
 * paiement d'une commande carte. Le servir brut affichait un QR de retrait sur
 * une commande « À régler » (constaté en production le 2026-10-09). Aucun
 * lecteur ne sert plus `handoverToken` brut à un client ni à un PDF (plan
 * `plan-carte-reglee-avant-tout.md`, §4.2) : il passe par ici.
 */
export function exposedHandoverToken(view: {
  readonly paymentStatus: PaymentStatus;
  readonly handoverToken: string | null;
}): string | null {
  return isSettled(view.paymentStatus) ? view.handoverToken : null;
}
