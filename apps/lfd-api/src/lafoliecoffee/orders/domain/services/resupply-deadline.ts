import type { DeadlineLine, DeadlineOrder, DeadlineSite } from "./deadline-thresholds.js";

/** Un réassort « pour demain » envoyé, réduit à ce qui fixe son échéance. */
export interface DeadlineResupply {
  readonly siteId: string;
  /** Le point est servi par un transfert interne ; `false` = sur place (le Labo). */
  readonly servedByTransfer: boolean;
  /** L'heure d'ARRIVÉE voulue au point, `HH:mm` ; `null` = envoyé sans heure. */
  readonly arrivalBy: string | null;
  readonly lines: readonly DeadlineLine[];
}

/**
 * **Un réassort, comme un élément de plus du compte à rebours** (plan
 * `reassort-boutiques/plan-heure-du-reassort.md`, H3c) : traduit en
 * {@link DeadlineOrder} pour que `deadlineThresholds` garde SEULE
 * l'arithmétique.
 *
 * - servi par transfert, point résolu : le site résolu, dont `requiredBy`
 *   compose déjà l'heure du point et celles des réassorts — l'échéance est
 *   `requiredBy − marge de livraison`, comme les commandes du point ;
 * - servi sur place : l'heure est déjà une arrivée au comptoir, donc une
 *   fenêtre `heure` sans mise en place — l'échéance est `heure − marge de
 *   retrait`, la mise en place n'est pas retirée une seconde fois ;
 * - point par transfert non résolu : la même fenêtre, comme une commande au
 *   site non résolu ;
 * - sans heure : aucune fenêtre, donc le dernier seuil (`undated`).
 */
export function resupplyDeadline(
  resupply: DeadlineResupply,
  site: DeadlineSite | undefined,
): DeadlineOrder {
  const base = { fulfillmentMethod: "pickup" as const, lines: resupply.lines };
  if (resupply.arrivalBy === null) {
    return { ...base, window: null };
  }
  if (resupply.servedByTransfer && site?.supply === "transfer") {
    return { ...base, window: null, site };
  }
  const window = { start: null, end: resupply.arrivalBy };
  return resupply.servedByTransfer
    ? { ...base, window }
    : { ...base, window, site: { supply: "on_site", counterSetupMinutes: 0 } };
}
