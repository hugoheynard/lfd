import type { ReservedVisibility } from "@lfd/contracts";

import { holderIds } from "../../shared/company-standing/domain/reservation-holders.js";
import { viewerAudience, type CatalogViewer } from "./catalog-viewer.js";
import { servedTo, type ServableItem } from "./served-to.js";

/** Ce qu'un article réservé dit au lecteur : est-il des siens, et que voient les autres ? */
export interface ItemReservation {
  /** Les sociétés réservataires qui comptent pour ce lecteur ({@link viewerHolderIds}) — vide sinon. */
  readonly heldBy: readonly string[];
  readonly visibility: ReservedVisibility;
}

/**
 * Le verdict d'un article pour un lecteur (`plan-articles-sur-mesure.md`, § 5) :
 * servi, listé non commandable, ou absent comme un SKU inconnu.
 */
export type ViewerVerdict = "served" | "locked" | "absent";

/**
 * **L'article est-il servi à CE lecteur ?** — `servedTo` (audience, masquages,
 * validations, S3), puis la réservation (S1, S2, S7). Pure : la ligne lue et
 * le lecteur suffisent.
 *
 * - le public et le personnel n'ont que `servedTo` : S3 y est déjà, et le
 *   personnel voit les réservations (S5) ;
 * - un pro anonyme ne voit jamais un article réservé (Q2) ;
 * - un pro reconnu le voit s'il est des réservataires, lui ou son principal
 *   actif (S1) ; sinon `visible_locked` le liste verrouillé, au seul lecteur
 *   qui le demande (S7), et `hidden` le fait disparaître (S2).
 */
export function servedToViewer(
  item: ServableItem,
  reservation: ItemReservation,
  viewer: CatalogViewer,
): ViewerVerdict {
  if (!servedTo(item, viewerAudience(viewer))) {
    return "absent";
  }
  if (!item.isReserved || viewer.kind === "public" || viewer.kind === "staff") {
    return "served";
  }
  if (viewer.kind === "pro_anonymous") {
    return "absent";
  }
  if (viewer.waiveReservation === true || heldByAny(reservation, holderIds(viewer.holders))) {
    return "served";
  }
  return reservation.visibility === "visible_locked" && viewer.show === "served_and_locked"
    ? "locked"
    : "absent";
}

/**
 * **L'étiquette de réservation** d'un article servi — ce qu'un écran en dit :
 * `none` (ouvert à tous), `mine` (réservé au lecteur ou au compte regardé),
 * `other` (réservé à un autre compte : verrouillé chez un pro, étiqueté chez le
 * personnel), `reserved` (le personnel sans compte regardé).
 */
export type CatalogReservationMark = "none" | "mine" | "other" | "reserved";

export function reservationMarkOf(
  item: Pick<ServableItem, "isReserved">,
  reservation: ItemReservation,
  viewer: CatalogViewer,
): CatalogReservationMark {
  if (!item.isReserved) {
    return "none";
  }
  if (viewer.kind === "staff" && viewer.regarding === null) {
    return "reserved";
  }
  if (viewer.kind === "pro" && viewer.waiveReservation === true) {
    return "mine";
  }
  return reservation.heldBy.length > 0 ? "mine" : "other";
}

function heldByAny(reservation: ItemReservation, holders: readonly string[]): boolean {
  return reservation.heldBy.some((companyId) => holders.includes(companyId));
}
