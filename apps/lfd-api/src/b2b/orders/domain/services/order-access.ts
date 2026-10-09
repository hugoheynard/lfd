import { OrderCompanyNotFoundError, OrderNotFoundError } from "../errors/order-errors.js";
import type { OrderRole } from "../ports/order-guard.reader.js";

/**
 * Mur de tenancy pour les commandes rattachées à une entreprise : il faut en être
 * **membre**. `null` (aucun rattachement) → 404 non-divulguant. Fonction pure — le
 * rôle vient d'un port, la décision reste testable sans infrastructure.
 *
 * ⚠️ Ce mur ne s'applique QUE lorsqu'une entreprise est visée. Une commande
 * **personnelle** (sans entreprise) est murée par le seul `placedByUserId` : il n'y
 * a pas de `role` à vérifier — n'importe quel client connecté peut commander pour
 * lui-même. Le **droit de commander** n'a plus de gate d'activation (zéro friction) :
 * c'est le **terme** de règlement qui décide carte vs facturation différée.
 *
 * @throws {OrderCompanyNotFoundError} le demandeur n'est pas membre.
 */
export function ensureOrderMember(role: OrderRole | null, companyId: string): void {
  if (role === null) {
    throw new OrderCompanyNotFoundError(companyId);
  }
}

/**
 * Mur de **visibilité d'une commande**, une fois qu'on l'a lue. Deux régimes,
 * dérivés de la commande elle-même :
 *
 * - **personnelle** (`companyId === null`) — seul celui qui l'a passée la voit ;
 * - **d'entreprise** — il faut en être membre, `role` non nul.
 *
 * Un seul et même 404 dans les deux refus (cf. {@link OrderNotFoundError}) : on
 * ne dit pas à un curieux qu'un numéro existe mais ne lui appartient pas.
 *
 * Fonction pure : le rôle vient d'un port, la décision reste testable sans
 * infrastructure. `role` doit être `null` pour une commande personnelle — il n'y
 * a pas d'entreprise où en avoir un.
 *
 * @throws {OrderNotFoundError} la commande n'est pas visible par ce demandeur.
 */
export function ensureOrderVisible(
  order: { readonly companyId: string | null; readonly placedByUserId: string },
  actorUserId: string,
  role: OrderRole | null,
  orderId: string,
): void {
  if (!isOrderVisible(order, actorUserId, role)) {
    throw new OrderNotFoundError(orderId);
  }
}

/**
 * La même règle, en prédicat — pour un lecteur qui doit répondre « pas à
 * vous » sans lever l'erreur de ce contexte : le signalement d'un problème
 * (`b2b/contact`, `demandes-clients.md` §6.4) l'emploie pour ne pas
 * écrire une seconde règle d'accès.
 */
export function isOrderVisible(
  order: { readonly companyId: string | null; readonly placedByUserId: string },
  actorUserId: string,
  role: OrderRole | null,
): boolean {
  if (order.companyId === null) {
    return order.placedByUserId === actorUserId;
  }
  return role !== null;
}
