import type { DossierOrderPlace, FrozenInvoiceOrder } from "./invoice-dossier.types.js";

/**
 * **L'historique retrait / livraison de chaque bon du dossier** (plan
 * `plan-simulateur-dossier-de-facturation.md`, §3.3, DF3).
 *
 * Pur : il reçoit ce que le retrait et la livraison ont dit de ces commandes
 * (par leurs canaux), et rend une frise datée par bon, la date de livraison
 * réelle d'un bon livré, et la liste des bons facturés sans aucun fait de
 * retrait — la première chose qu'un comptable doit voir (Q1, Hugo, 2026-10-08).
 */

/** Comment le retrait a été attesté. */
export type DossierHandoverVia = "scan" | "manual" | "deposit";

/** Le retrait d'une commande, tel que le retrait l'a attesté. */
export interface DossierHandoverFact {
  readonly handedOverAt: Date;
  readonly via: DossierHandoverVia;
  /** Une preuve de remise à la porte existe. */
  readonly atDoor: boolean;
}

/** Un arrêt d'une commande dans une tournée. */
export interface DossierStopFact {
  readonly serviceDay: string;
  readonly placedAt: Date;
  readonly departedAt: Date | null;
  readonly closedAt: Date | null;
  readonly broughtBackAt: Date | null;
}

/**
 * Ce qui est arrivé au bon. `handed_over` = retiré au comptoir ;
 * `handed_over_at_door` = remis au client à la porte ; `deposited` = déposé
 * sans personne ; `replaced` = remis dans une tournée après un retour.
 */
export type DossierHistoryKind =
  "handed_over" | "handed_over_at_door" | "deposited" | "departed" | "brought_back" | "replaced";

/** Un fait daté de la frise. */
export interface DossierHistoryEvent {
  readonly kind: DossierHistoryKind;
  readonly at: Date;
  /** Le jour de la tournée, pour un fait de livraison ; `null` au comptoir. */
  readonly serviceDay: string | null;
  /** La voie du retrait, pour un fait de retrait ; `null` sinon. */
  readonly via: DossierHandoverVia | null;
}

/** L'historique d'un bon. */
export interface DossierOrderHistory {
  /** Du plus ancien au plus récent. */
  readonly events: readonly DossierHistoryEvent[];
  /** Un fait de retrait existe (comptoir, porte ou dépôt). */
  readonly handedOver: boolean;
  /**
   * Le jour de la tournée qui l'a livré — sa date réelle, quand il a été
   * rapporté puis replacé un autre jour que sa date demandée. `null` au
   * comptoir, ou s'il n'est pas livré.
   */
  readonly actualDeliveryDay: string | null;
}

/** Un bon du dossier, avec son lieu et son historique. */
export interface DossierOrderRecord {
  readonly order: FrozenInvoiceOrder;
  readonly place: DossierOrderPlace;
  readonly history: DossierOrderHistory;
}

/** La frise d'un bon, à partir de ce que le retrait et la livraison en disent. */
export function orderHistory(
  handover: DossierHandoverFact | null,
  stops: readonly DossierStopFact[],
): DossierOrderHistory {
  const events = [...stopEvents(stops), ...handoverEvents(handover)].sort(
    (a, b) => a.at.getTime() - b.at.getTime(),
  );
  return {
    events,
    handedOver: handover !== null,
    actualDeliveryDay: handover?.atDoor === true ? deliveringDay(stops) : null,
  };
}

/** Les références des bons facturés sans aucun fait de retrait, dans l'ordre reçu. */
export function neverHandedOver(
  records: readonly {
    readonly order: { readonly reference: string };
    readonly history: DossierOrderHistory;
  }[],
): readonly string[] {
  return records
    .filter((record) => !record.history.handedOver)
    .map((record) => record.order.reference);
}

function handoverEvents(handover: DossierHandoverFact | null): readonly DossierHistoryEvent[] {
  if (handover === null) {
    return [];
  }
  return [
    {
      kind: handoverKind(handover),
      at: handover.handedOverAt,
      serviceDay: null,
      via: handover.via,
    },
  ];
}

function handoverKind(handover: DossierHandoverFact): DossierHistoryKind {
  if (handover.via === "deposit") {
    return "deposited";
  }
  return handover.atDoor ? "handed_over_at_door" : "handed_over";
}

function stopEvents(stops: readonly DossierStopFact[]): readonly DossierHistoryEvent[] {
  const events: DossierHistoryEvent[] = [];
  let lastBroughtBack: Date | null = null;
  for (const stop of [...stops].sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime())) {
    const day = stop.serviceDay;
    if (lastBroughtBack !== null && stop.placedAt >= lastBroughtBack) {
      events.push({ kind: "replaced", at: stop.placedAt, serviceDay: day, via: null });
    }
    if (stop.departedAt !== null) {
      events.push({ kind: "departed", at: stop.departedAt, serviceDay: day, via: null });
    }
    if (stop.broughtBackAt !== null) {
      events.push({ kind: "brought_back", at: stop.broughtBackAt, serviceDay: day, via: null });
      lastBroughtBack = stop.broughtBackAt;
    }
  }
  return events;
}

/** Le dernier arrêt parti et clos sans retour : celui qui a livré. */
function deliveringDay(stops: readonly DossierStopFact[]): string | null {
  const delivering = stops
    .filter(
      (stop) => stop.departedAt !== null && stop.closedAt !== null && stop.broughtBackAt === null,
    )
    .sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime());
  return delivering.at(-1)?.serviceDay ?? null;
}
