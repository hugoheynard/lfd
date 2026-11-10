import type { AccountConcentration, OrderMetricsView } from "@lfd/contracts";

/** Agrégat quotidien d'une commande pour les métriques de volume/CA. */
export interface OrderDayTally {
  readonly caCents: number;
  /** CA marchandises HT (`subtotal − discount`) — sert au panier moyen. */
  readonly caGoodsCents: number;
  readonly orders: number;
  readonly caRecurringCents: number;
  readonly caOneShotCents: number;
}

/**
 * **Métriques de commande dans le temps** (pur) : projette les agrégats quotidiens sur
 * la fenêtre `window` (jours ISO), en remplissant 0 pour les jours sans commande. Le CA
 * récurrent + unique se somme au CA total (partition sur `fromSubscriptionId`).
 */
export function computeOrderMetrics(
  window: readonly string[],
  byDay: ReadonlyMap<string, OrderDayTally>,
  concentration: AccountConcentration,
  now: Date,
): OrderMetricsView {
  const at = (day: string): OrderDayTally =>
    byDay.get(day) ?? {
      caCents: 0,
      caGoodsCents: 0,
      orders: 0,
      caRecurringCents: 0,
      caOneShotCents: 0,
    };
  return {
    days: [...window],
    caCents: window.map((d) => at(d).caCents),
    caGoodsCents: window.map((d) => at(d).caGoodsCents),
    orders: window.map((d) => at(d).orders),
    caRecurringCents: window.map((d) => at(d).caRecurringCents),
    caOneShotCents: window.map((d) => at(d).caOneShotCents),
    concentration,
    computedAt: now.toISOString(),
  };
}
