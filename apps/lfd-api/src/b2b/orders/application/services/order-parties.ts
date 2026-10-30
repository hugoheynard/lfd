import type { OrderBuyerKind } from "../../domain/value-objects/order-buyer-kind.js";

/**
 * **Qui est concerné** par une commande : le client porté, et le membre de
 * l'équipe s'il a saisi à sa place.
 *
 * Déclaré à part parce que deux services le lisent désormais — celui qui compose
 * la commande et celui qui en résout les prix. Le laisser chez l'un aurait fait
 * dépendre l'autre d'un fichier dont il n'utilise rien d'autre.
 */
export interface OrderParties {
  readonly companyId: string | null;
  readonly placedByUserId: string;
  readonly placedByStaffId: string | null;
  /**
   * Sans compte ou reconnu — posé par CHAQUE handler selon sa route, jamais
   * lu d'un payload (plan des promotions, § 13.7). Obligatoire : un poseur
   * oublié ne compile pas.
   */
  readonly buyerKind: OrderBuyerKind;
}
