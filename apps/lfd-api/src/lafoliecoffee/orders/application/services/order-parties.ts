import type { OrderBuyerKind } from "../../domain/value-objects/order-buyer-kind.js";
import type { OrderOfferReason } from "../../domain/value-objects/order-offer.js";

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
  /**
   * Celui qui saisit peut passer outre la limite d'un produit qui le permet :
   * l'équipe, avec le droit `lfc_product_limit_override`, lu en base par la
   * porte staff. Faux pour le client, l'invité, la boutique et tout devis.
   * Obligatoire : un poseur oublié ne compile pas, et personne n'en hérite.
   */
  readonly exceedItemLimits: boolean;
  /**
   * Le motif d'une commande **offerte**, posé par la saisie de l'équipe
   * seule, après la garde du droit `b2b_offer_order`. Absent partout
   * ailleurs : le client, l'invité et la boutique n'offrent rien.
   */
  readonly offer?: OrderOfferReason;
  /**
   * L'équipe saisit ou modifie : les minimums d'achat en pièces des articles
   * ne s'appliquent pas (décidé par Hugo le 2026-11-23 — l'équipe commande ce
   * qu'il faut, la production s'adapte). Posé par la saisie de l'équipe, le
   * comptoir et la modification par l'équipe ; absent pour le client. Le
   * minimum et le pas d'un article au poids, eux, tiennent toujours.
   */
  readonly minimumsWaived?: boolean;
}
