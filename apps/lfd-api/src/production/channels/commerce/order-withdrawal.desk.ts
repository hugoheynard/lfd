import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * Ce que le retrait a constaté :
 *
 * - `withdrawn` — la commande est retirée du fournil (ou l'était déjà : un
 *   second retrait n'est pas une erreur) ; la clôture et le retirage
 *   l'écarteront ;
 * - `inscribed` — le fournil l'a déjà inscrite au compte à produire : elle sera
 *   fabriquée, rien n'est écrit.
 */
export type OrderWithdrawalOutcome = "withdrawn" | "inscribed";

/**
 * **Le guichet du retrait au fournil** — port que le fournil DÉCLARE et
 * IMPLÉMENTE, et que le commerce appelle quand l'équipe annule une commande
 * (doc `documentation/commandes/annulation/annulation-par-le-staff.md`, C3.4 et C3.4 ter,
 * 2026-10-12).
 *
 * ## Pourquoi un geste du fournil, et pas une lecture
 *
 * Prendre le verrou de la journée ne suffisait pas : la clôture et le retirage
 * lisent les commandes du commerce AVANT ce verrou. Une annulation validée
 * entre leur lecture et leur verrou aurait été inscrite quand même. Le retrait
 * est donc ÉCRIT chez le fournil, sous son verrou, et c'est l'agrégat de la
 * journée qui écarte les retraits qu'il relit sous le même verrou.
 *
 * 🔴 **Dans l'unité de travail de l'appelant** (précédent : `BinDesk`) :
 * l'implémentation ouvre la sienne, qui REJOINT celle du commerce. Si
 * l'annulation échoue ensuite, le retrait disparaît avec elle.
 *
 * Ordre des verrous : la ligne `orders` (prise par l'appelant) PUIS la journée.
 * La clôture prend la journée sans toucher `orders` : pas de cycle (C3.4 ter).
 *
 * `production → b2b` reste interdit : le fournil ne sait pas qui l'appelle.
 */
export abstract class OrderWithdrawalDesk {
  /**
   * Verrouille la journée, regarde si la commande y est inscrite, et sinon
   * écrit le retrait (idempotent sur la commande).
   */
  abstract withdraw(day: ServiceDay, orderId: string): Promise<OrderWithdrawalOutcome>;
}
