import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * Ce que le guichet a constaté :
 *
 * - `noted` — la révision est notée sur chaque journée : une clôture ou un
 *   retirage qui avait lu les commandes avant elle les relira sous son verrou ;
 * - `inscribed` — le fournil a déjà inscrit la commande au compte à produire :
 *   elle ne se modifie plus, rien n'est écrit.
 */
export type OrderRevisionOutcome = "noted" | "inscribed";

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
   * inscrite, et sinon note sa nouvelle révision sur chacune.
   */
  abstract note(
    days: readonly ServiceDay[],
    orderId: string,
    revision: number,
  ): Promise<OrderRevisionOutcome>;
}
