import type { ContentLocale } from "@lfd/contracts";

import type { OrderNoShow } from "../entities/order-no-show.js";

/** La commande relue sous son verrou, et à qui, dans quelle langue, écrire. */
export interface LockedOrderNoShow {
  readonly noShow: OrderNoShow;
  /** Le client de la commande : le sujet du fait, et le destinataire de l'e-mail. */
  readonly placedByUserId: string;
  /** La langue de la commande ; `null` = commande sans langue. */
  readonly locale: ContentLocale | null;
  /** Le point de retrait figé à la commande ; `null` s'il n'a pas de nom. */
  readonly pickupLabel: string | null;
}

/**
 * Port d'**écriture** de la commande non retirée — il prend l'agrégat. Un port
 * à part d'`OrderRepository` (ISP) : déclarer l'absence du client et le
 * prévenir n'écrivent rien d'autre de la commande.
 */
export abstract class OrderNoShowRepository {
  /**
   * Verrouille la ligne de la commande (`SELECT … FOR UPDATE`) et la relit —
   * le même verrou que le retrait prend avant d'attester : une remise et une
   * déclaration simultanées ne passent pas toutes les deux. `null` : commande
   * inconnue. Dans une unité de travail.
   */
  abstract lock(orderId: string): Promise<LockedOrderNoShow | null>;

  /** Écrit le statut et les deux traces (instant, auteur) — rien d'autre de la commande. */
  abstract save(noShow: OrderNoShow): Promise<void>;
}
