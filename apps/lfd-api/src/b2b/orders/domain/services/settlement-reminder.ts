import { decideOrderCutoff, instantToLocal, type OrderCutoffView } from "@lfd/contracts";

/**
 * La règle d'heure limite qu'on oppose à une JOURNÉE, et non à un panier : le
 * défaut de la plateforme (`pickupAddressId` à `null`), comme le fil des
 * journées demandables.
 *
 * ⚠️ Une commande ne garde ni l'identifiant de son point de retrait (seulement
 * le snapshot postal), ni la limite propre de ses articles (vérifié le
 * 2026-09-26, `orders.prisma`, `Order.pickupAddress`). La journée est donc le
 * seul grain qu'on sait relire après coup — c'est aussi celui que le plan
 * nomme (« l'heure limite de commande de la journée », Q6).
 */
const DAY_RULE_POINT = null;

/** Ce qu'il faut savoir d'une commande pour la situer dans sa journée. */
export interface SettlementReminderSubject {
  /** Le jour de retrait (`AAAA-MM-JJ`), ou `null` — aucun n'a été demandé. */
  readonly serviceDay: string | null;
  readonly placedAt: Date;
}

/**
 * La journée de service d'une commande : son jour de retrait, ou, sans lui, son
 * jour de passation **à Paris** — le même rattachement que la clôture (Q5, S6),
 * sans quoi on préviendrait pour une journée que la clôture ne balaie pas.
 */
export function settlementReminderDay(subject: SettlementReminderSubject): string {
  return subject.serviceDay ?? instantToLocal(subject.placedAt).day;
}

/**
 * **Faut-il prévenir le commercial maintenant ?** (plan
 * `documentation/order/plan-abandon-du-reglement.md`, Q6, S5)
 *
 * Oui dès que l'heure limite de la journée est passée — grâce comprise : un
 * client dans son rattrapage n'a pas payé à l'heure, et c'est le moment de le
 * relancer, pas quand la grâce se ferme.
 *
 * Non quand aucune règle ne couvre la journée, ou que son heure n'existe pas
 * ce jour-là : sans limite, il n'y a pas de « trop tard » à annoncer, et
 * sonner sur une limite inventée serait pire que se taire.
 *
 * La borne haute, la clôture, n'est pas lue ici : la clôture annule la commande
 * (Q7), qui cesse alors d'être candidate — le lecteur ne rend que des commandes
 * encore `placed`.
 */
export function isSettlementReminderDue(
  rules: readonly OrderCutoffView[],
  serviceDay: string,
  now: Date,
): boolean {
  return decideOrderCutoff(rules, DAY_RULE_POINT, serviceDay, now).status !== "open";
}
