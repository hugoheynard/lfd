import type { ContentLocale } from "@lfd/contracts";

import type { OrderCustomerNudges } from "../entities/order-customer-nudges.js";

/** Les relances relues sous le verrou de la commande, et à qui, dans quelle langue, écrire. */
export interface LockedOrderCustomerNudges {
  readonly nudges: OrderCustomerNudges;
  /** Le client qui a passé la commande : le destinataire. */
  readonly placedByUserId: string;
  /** La langue de la commande ; `null` = commande sans langue. */
  readonly locale: ContentLocale | null;
  /** Le point de retrait figé à la commande ; `null` s'il n'a pas de nom. */
  readonly pickupLabel: string | null;
}

/**
 * Port d'**écriture** des deux relances d'un retrait en retard (2026-10-25) —
 * il prend l'agrégat. Un port à part d'`OrderRepository` (ISP) : relancer un
 * client n'écrit rien d'autre de la commande.
 */
export abstract class OrderCustomerNudgesRepository {
  /**
   * Verrouille la ligne de la commande (`SELECT … FOR UPDATE`) et relit ses
   * relances — deux superviseurs qui cliquent ensemble ne font partir qu'un
   * courriel. `null` : commande inconnue. Dans une unité de travail.
   */
  abstract lock(orderId: string): Promise<LockedOrderCustomerNudges | null>;

  /** Écrit les deux traces (instant, auteur) — rien d'autre de la commande. */
  abstract save(nudges: OrderCustomerNudges): Promise<void>;
}
