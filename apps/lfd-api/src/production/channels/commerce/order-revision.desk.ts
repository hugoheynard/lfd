import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * Ce que le guichet a constaté :
 *
 * - `noted` — la révision est notée sur chaque journée : une clôture ou un
 *   retirage qui avait lu les commandes avant elle les relira sous son verrou ;
 * - `inscribed` — le fournil a déjà inscrit la commande au compte à produire,
 *   et l'autorisation ne va pas au-delà : rien n'est écrit ;
 * - `raised` — inscrite, sous `staff_quantities` (plan A2, § 7) : le dû de la
 *   commande est révisé au plan, au moins une ligne a monté, le compte du
 *   jour aussi, et le fait `production.order_quantities_raised` est parti ;
 * - `unchanged` — inscrite, sous `staff_quantities` : le dû est révisé, rien
 *   n'a monté (une baisse) — le compte du jour ne bouge pas.
 */
export type OrderRevisionOutcome = "noted" | "inscribed" | "raised" | "unchanged";

/**
 * Jusqu'où la révision peut aller, décidé par le commerce (plan A2,
 * `documentation/commandes/modification/plan-a2-modifier-une-commande-inscrite.md`,
 * § 7, B4) : `before_inscription`, la règle d'avant ; `staff_quantities`,
 * l'équipe change les quantités d'une commande au compte, mêmes articles, même
 * jour. Une valeur PROPRE à la révision : l'autorisation de l'annulation
 * (A1) n'en sait rien. Le fournil ne sait pas pourquoi — il applique.
 */
export type OrderRevisionAllowance = "before_inscription" | "staff_quantities";

/** Une ligne de la commande révisée, telle que le fournil la reçoit : l'article et son dû. */
export interface RevisedOrderLine {
  readonly sku: string;
  readonly quantity: number;
}

/**
 * **Le guichet de la révision au fournil** — port que le fournil DÉCLARE et
 * IMPLÉMENTE, et que le commerce appelle quand une commande est modifiée
 * (plan `documentation/commandes/modification/plan-modifier-une-commande.md`, §9.1,
 * 2026-10-23). Même figure que {@link OrderWithdrawalDesk}, pour la même
 * raison : la clôture et le retirage lisent les commandes du commerce AVANT
 * le verrou de la journée, et une révision validée entre les deux aurait été
 * inscrite dans son ancienne composition.
 *
 * La révision passe donc, sous le verrou de chaque journée qu'elle touche
 * (l'ancienne et la nouvelle si la date change, la plus ancienne d'abord),
 * par une écriture du fournil que la clôture relit sous le même verrou : si
 * une révision a été notée depuis sa lecture, elle relit les commandes.
 *
 * 🔴 **Dans l'unité de travail de l'appelant** : l'implémentation rejoint la
 * sienne. Si la révision échoue ensuite, la note disparaît avec elle.
 *
 * Ordre des verrous : la ligne `orders` (prise par l'appelant) PUIS les
 * journées, par date croissante. La clôture ne prend qu'une journée et ne
 * verrouille pas `orders` : pas de cycle.
 */
export abstract class OrderRevisionDesk {
  /**
   * Verrouille chaque journée (date croissante), regarde si la commande est
   * inscrite, et sinon note sa nouvelle révision sur chacune. Inscrite sous
   * `staff_quantities`, et sur une seule journée (une révision après l'arrêt
   * ne change pas de jour) : révise son dû au plan (plan A2, § 7).
   *
   * @param lines la composition révisée entière, un article par ligne.
   */
  abstract note(
    days: readonly ServiceDay[],
    orderId: string,
    revision: number,
    lines: readonly RevisedOrderLine[],
    allowance: OrderRevisionAllowance,
  ): Promise<OrderRevisionOutcome>;
}
