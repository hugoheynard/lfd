import type { DeliveryNoteOrder } from "./order-lines-for-delivery-note.js";

/** Les statuts d'une commande, tels que le bon de livraison les lit. */
export type DeliveryNoteOrderStatus =
  | "draft"
  | "placed"
  | "confirmed"
  | "in_production"
  | "ready"
  | "partially_handed_over"
  | "fulfilled"
  | "cancelled";

/** Une commande, vue du BL qui la suit : ses lignes, son statut, les instants qui le datent. */
export interface DeliveryNoteOrderProgress extends DeliveryNoteOrder {
  readonly status: DeliveryNoteOrderStatus;
  readonly confirmedAt: Date | null;
  readonly readyAt: Date | null;
  readonly handedOverAt: Date | null;
  /** Jour de réception `AAAA-MM-JJ`, ou `null`. */
  readonly receivedOn: string | null;
}

/**
 * **Où en est une commande, vu du BL qui la suit** (plan
 * plan E2 (`documentation/commandes/bon-de-livraison.md`), § 8.3) — port de
 * lecture déclaré par les commandes, implémenté dans `b2b/orders/infrastructure/`.
 *
 * Lu par les gestes, dans l'unité de travail de l'appelant, APRÈS l'écriture
 * conditionnelle de la commande : la ligne `orders` est déjà verrouillée par
 * cet `UPDATE` (commande puis BL, plan E2 § 8.3).
 */
export abstract class OrderProgressForDeliveryNote {
  /** La commande, ou `null` si l'identifiant est inconnu. */
  abstract progressOf(orderId: string): Promise<DeliveryNoteOrderProgress | null>;
}

/**
 * **Les commandes que le réconciliateur des BL passe en revue** (plan E2,
 * § 8.2) — port de lecture déclaré par les commandes. Séparé de
 * {@link OrderProgressForDeliveryNote} (ISP) : seul le réconciliateur
 * PARCOURT (`pageAfter`).
 *
 * ⚠️ Il disait « seul le réconciliateur parcourt et verrouille » : faux
 * depuis L4a du plan E7 reliquat. `lockProgressOf` est aussi pris par le prêt
 * et la remise d'un reste (`prepare-remainder-note.handler.ts`,
 * `hand-over-remainder-note.handler.ts`) et par l'impression d'un BL
 * (`record-delivery-note-print.handler.ts`) ; la remise du rang 1 prend la
 * même ligne par `OrderLock` (vérifié le 2026-10-26).
 */
export abstract class OrdersToReconcileDeliveryNotes {
  /**
   * Une page de commandes, par identifiant croissant après `afterId`, parmi
   * celles qu'un BL suit ou pourrait suivre à tort (`confirmed`, `ready`,
   * `partially_handed_over`, `fulfilled`, `cancelled`, et les statuts morts
   * `draft` / `in_production`,
   * pour les compter). Sans verrou : la décision se refait sous verrou.
   */
  abstract pageAfter(
    afterId: string | null,
    limit: number,
  ): Promise<readonly DeliveryNoteOrderProgress[]>;

  /**
   * La commande relue sous `SELECT … FOR UPDATE` — le verrou de la commande
   * d'abord, celui du BL ensuite (plan E2, § 8.3). Dans une unité de travail.
   */
  abstract lockProgressOf(orderId: string): Promise<DeliveryNoteOrderProgress | null>;
}
