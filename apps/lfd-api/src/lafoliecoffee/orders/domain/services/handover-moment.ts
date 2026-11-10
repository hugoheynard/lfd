import type { FulfillmentWindow, LocalMoment } from "@lfd/contracts";

/**
 * **L'instant qu'une promotion « au retrait / à la livraison » juge**
 * (`documentation/promotions/plan-jours-et-heures.md`, § 6 Q1 et § 8.3) — pur :
 * le jour de service et le DÉBUT du créneau choisi, sa FIN quand il n'a pas
 * de début (« avant 10 h »). Sans jour ou sans créneau, `null` : rien n'est
 * promis sur un instant inconnu.
 *
 * Une lecture murale (`AAAA-MM-JJ` + `HH:MM`, Paris), jamais un instant UTC :
 * c'est ce que le client a choisi sur la pendule de la boutique.
 */
export function handoverMomentOf(
  day: string | null,
  window: FulfillmentWindow | null | undefined,
): LocalMoment | null {
  if (day === null || window === null || window === undefined) {
    return null;
  }
  return { day, time: window.start ?? window.end };
}
