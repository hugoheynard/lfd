import type { OrderSaleUnit } from "./order.js";

/**
 * **Pourquoi le comptoir ne peut pas proposer un départ incomplet** — un code
 * par cas, dans l'ordre où le geste juge (`POST
 * /admin/counter/orders/:orderId/incomplete-handover`, lot C1). La lecture
 * rend le PREMIER refus que le geste rencontrerait ; l'écran choisit sa
 * phrase (lot C1b, plan
 * `documentation/commandes/reliquat/depart-incomplet.md`, §4.1 —
 * Hugo, 2026-11-03).
 *
 * | Code                 | Refus du geste (code d'erreur)                    |
 * | -------------------- | ------------------------------------------------- |
 * | `not_a_pickup`       | `handover.counter.out_of_reach` — une livraison   |
 * | `other_day`          | `handover.counter.out_of_reach` — un autre jour   |
 * | `handover_refused`   | `handover.refused`, `handover.transfer_*` — phrase dans `handoverRefusalReason` |
 * | `already_decided`    | `orders.shortfall_decision.already_decided`       |
 * | `not_confirmed`      | `orders.shortfall_decision.not_confirmed`         |
 * | `card`               | `orders.shortfall_decision.card`                  |
 * | `voucher`            | `orders.shortfall_decision.voucher`               |
 * | `too_old`            | `orders.shortfall_decision.too_old`               |
 * | `not_drawn`          | `packing.order.not_drawn_yet`                     |
 * | `withdrawn`          | `packing.sheet.withdrawn`                         |
 * | `sealed`             | `production.packing.order_sealed`                 |
 * | `counted`            | `packing.containers.counted`                      |
 * | `already_authorized` | `packing.shortfall.already_authorized`            |
 * | `nothing_short`      | `packing.shortfall.nothing_short` — « Remettre » suffit |
 * | `nothing_departs`    | `orders.shortfall_decision.nothing_departs` — renvoyer à l'annulation |
 */
export const COUNTER_INCOMPLETE_HANDOVER_REFUSALS = [
  "not_a_pickup",
  "other_day",
  "handover_refused",
  "already_decided",
  "not_confirmed",
  "card",
  "voucher",
  "too_old",
  "not_drawn",
  "withdrawn",
  "sealed",
  "counted",
  "already_authorized",
  "nothing_short",
  "nothing_departs",
] as const;

export type CounterIncompleteHandoverRefusal =
  (typeof COUNTER_INCOMPLETE_HANDOVER_REFUSALS)[number];

/**
 * Une ligne du bac : ce qui est dû, ce qui partirait (au bac), ce qui ne
 * partirait pas. `due`, `departing` et `notDeparting` sont des grammes si
 * `saleUnit = "weight"`.
 */
export interface CounterIncompleteHandoverLine {
  readonly sku: string;
  readonly productName: string;
  readonly saleUnit: OrderSaleUnit;
  readonly due: number;
  readonly departing: number;
  readonly notDeparting: number;
}

/**
 * `GET /admin/counter/orders/:orderId/incomplete-handover`, sous
 * `handover_counter:read` — l'aperçu du départ incomplet, AVANT le geste.
 *
 * `refusal` vaut `null` quand le départ incomplet peut être proposé. Un
 * aperçu, pas une promesse : le geste rejuge sous verrou.
 *
 * `lines` porte le bac dès que le colisage peut le lire — même quand un refus
 * du commerce passe avant (une carte : on montre ce qui manque, et pourquoi
 * on ne le propose pas) ; vide si la fiche n'est pas lisible (pas tirée,
 * retirée, bac fermé, comptée, départ autorisé, rien ne manque) ou si la
 * commande est hors de portée du comptoir.
 */
export interface CounterIncompleteHandoverView {
  readonly orderId: string;
  readonly refusal: CounterIncompleteHandoverRefusal | null;
  /** La phrase du retrait, pour `handover_refused` seulement ; sinon `null`. */
  readonly handoverRefusalReason: string | null;
  readonly lines: readonly CounterIncompleteHandoverLine[];
  /**
   * Le départ incomplet DÉJÀ tranché — qui l'a validé, et quand — pour
   * `already_decided` et `already_authorized` seulement ; `null` ailleurs, et
   * `null` si aucune décision n'est lisible (Hugo, 2026-11-03 : l'écran offre
   * alors « Remettre la commande » avec « Départ incomplet validé par <Nom> à
   * <heure> »). Le serveur le rend toujours ; optionnel pour que les
   * fixtures du front d'avant restent valides. Dans ces deux cas, `lines` est la décision prise : `departing`
   * ce qui a été décidé de faire partir, `notDeparting` le reste abandonné.
   */
  readonly decision?: CounterIncompleteHandoverDecision | null;
}

/** La décision prise : l'instant (ISO) et l'auteur nommé par l'annuaire, `null` s'il n'y est plus. */
export interface CounterIncompleteHandoverDecision {
  readonly decidedAt: string;
  readonly decidedByName: string | null;
}
