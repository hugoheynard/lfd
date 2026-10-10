/**
 * Pourquoi un règlement est mort — chacun appelle un message différent :
 *
 * - `refused` — la banque a refusé la carte (webhook Stripe). La commande reste
 *   `placed` et se reprend sur la même intention ;
 * - `abandoned` — le client a quitté l'écran de règlement. Il vient de cliquer :
 *   aucun courriel ne lui apprend ce qu'il sait déjà ;
 * - `day_closed` — la clôture de la journée a coupé un règlement resté en
 *   l'air : la commande est annulée, pour toutes les clientèles (Q7) ;
 * - `expired` — une commande boutique non réglée a dépassé son délai
 *   (`UNSETTLED_SHOP_ORDER_TTL_MINUTES`) : annulée avec son intention ;
 * - `replaced` — le même particulier a passé une nouvelle commande boutique :
 *   la précédente, non réglée, est annulée avec son intention.
 *
 * `expired` et `replaced` n'appellent AUCUN courriel (plan
 * `documentation/order/commande-carte-reglee.md`, §4.2) : la personne a
 * quitté la page ou relancé elle-même. Ils ne concernent que la clientèle
 * `public`, donc ne sonnent pas non plus.
 */
export type PaymentFailureCause = "refused" | "abandoned" | "day_closed" | "expired" | "replaced";

/**
 * Fait de domaine : **le règlement d'une commande est mort**.
 *
 * 🔴 **Ce fait n'existait pas, et son absence coûtait deux choses** (Hugo,
 * 2026-09-17). Le dépôt écrivait `failed` dans une colonne que personne ne
 * relisait : le client n'était averti de rien — il avait même reçu, à la
 * passation, un courriel lui annonçant que sa commande entrait en fabrication —
 * et le comptoir continuait de l'attendre.
 *
 * ⚠️ Comme son jumeau `order.paid`, il n'est publié qu'au
 * **franchissement** : un webhook rejoué ou un second clic ne bascule aucune
 * ligne, donc ne prévient pas deux fois.
 *
 * 🔴 **Il porte sa cause depuis le 2026-09-26.** Son JSDoc disait qu'il ne
 * couvrait pas l'abandon d'une carte — fermer l'onglet n'émet rien chez
 * Stripe — et que fermer ce cas était « un autre chantier » : c'est le plan
 * `documentation/order/plan-abandon-du-reglement.md`. L'abandon et la clôture
 * de la journée le publient désormais eux-mêmes, avec leur cause ; les abonnés
 * (courriel, cloche) choisissent sur elle. Un onglet fermé SANS cliquer ne
 * publie toujours rien — c'est la clôture qui le rattrape.
 */
export class OrderPaymentFailedEvent {
  constructor(
    readonly orderId: string,
    readonly cause: PaymentFailureCause,
  ) {}
}
