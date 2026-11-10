import { CARD_REFUND_STATUSES, type CardRefundStatus } from "../ports/card-provider-types.js";

/**
 * **Les valeurs du remboursement par carte** (plan M2, §3.4, §5.1) — 🔴
 * valeurs des enums Postgres du schéma `card_payment` (migration
 * `20261110010100_le_remboursement_par_carte`) : elles ne se renomment que par
 * migration.
 */

/** L'état d'une demande (`CardRefundRequestState`). */
export const CARD_REFUND_REQUEST_STATES = [
  "to_issue",
  "issued",
  "refunded",
  "stopped",
  "settled_elsewhere",
] as const;
export type CardRefundRequestState = (typeof CARD_REFUND_REQUEST_STATES)[number];

/** La forme d'une demande (`CardRefundForm`) : tout le reste du paiement, ou un montant. */
export const CARD_REFUND_FORMS = ["remainder", "amount"] as const;
export type CardRefundForm = (typeof CARD_REFUND_FORMS)[number];

/**
 * La nature d'un remboursement (`CardRefundNature`) — la seule connaissance
 * métier du bloc, agnostique (§3.1) : la vente n'a pas lieu (`return`), ou le
 * montant dû a baissé (`adjustment`).
 */
export const CARD_REFUND_NATURES = ["return", "adjustment"] as const;
export type CardRefundNature = (typeof CARD_REFUND_NATURES)[number];

/** D'où vient une ligne du carnet (`CardRefundSource`). */
export const CARD_REFUND_SOURCES = ["provider", "manual"] as const;
export type CardRefundSource = (typeof CARD_REFUND_SOURCES)[number];

export { CARD_REFUND_STATUSES, type CardRefundStatus };

/**
 * **Les neuf transitions d'une demande**, et elles seules — la même liste que
 * le déclencheur `card_payment.refund_request_guard` (vérifié le 2026-11-10
 * dans `20261110010100_le_remboursement_par_carte/migration.sql`). `(x, x)`
 * n'en est pas une : c'est une écriture qui ne touche pas l'état.
 */
const REQUEST_TRANSITIONS: Readonly<
  Record<CardRefundRequestState, readonly CardRefundRequestState[]>
> = {
  to_issue: ["issued", "refunded", "stopped"],
  issued: ["refunded", "stopped"],
  stopped: ["to_issue", "refunded", "settled_elsewhere"],
  refunded: ["stopped"],
  settled_elsewhere: [],
};

/** Vrai si `from → to` est l'une des neuf transitions (jamais `(x, x)`). */
export function isCardRefundRequestTransition(
  from: CardRefundRequestState,
  to: CardRefundRequestState,
): boolean {
  return REQUEST_TRANSITIONS[from].includes(to);
}

/** Ce qu'un statut annoncé fait d'un statut connu au carnet. */
export type CardRefundStatusMove = "apply" | "stale" | "illegal";

const OPEN_STATUSES: ReadonlySet<CardRefundStatus> = new Set(["pending", "requires_action"]);

/**
 * **Un statut ne régresse pas** — la règle de `refundTransition`
 * (`b2b/orders/domain/entities/order-refund.ts`, recopiée le 2026-11-10 ;
 * ce fichier est retiré au lot P1.c, la règle ne vit plus qu'ici) et
 * du déclencheur `card_payment.refund_guard` :
 *
 * - depuis une attente (`pending`, `requires_action`), tout s'applique ;
 * - depuis `succeeded`, seul `failed` s'applique (une inversion, §6.2) ;
 *   `canceled` est **illégal** — le prestataire n'annule qu'une attente ;
 * - `failed` et `canceled` sont terminaux : le reste est périmé.
 */
export function cardRefundStatusMove(
  from: CardRefundStatus,
  to: CardRefundStatus,
): CardRefundStatusMove {
  if (from === to) {
    return "stale";
  }
  if (OPEN_STATUSES.has(from)) {
    return "apply";
  }
  if (from === "succeeded") {
    if (to === "failed") {
      return "apply";
    }
    return to === "canceled" ? "illegal" : "stale";
  }
  return "stale";
}

/** Un remboursement en attente de la banque : il est « en vol ». */
export function isOpenRefundStatus(status: CardRefundStatus): boolean {
  return OPEN_STATUSES.has(status);
}

/** Une valeur écrite en base, relue — `null` si ce binaire ne la connaît pas. */
export function oneOfValues<T extends string>(values: readonly T[], raw: string): T | null {
  return values.find((value) => value === raw) ?? null;
}
