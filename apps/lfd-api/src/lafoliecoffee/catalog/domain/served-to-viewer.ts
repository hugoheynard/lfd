import type { ReservedVisibility } from "@lfd/contracts";

import { holderIds } from "../../shared/company-standing/domain/reservation-holders.js";
import { viewerAudience, type CatalogViewer } from "./catalog-viewer.js";
import { servedTo, type ServableItem } from "./served-to.js";
import { menuMarkOf, type MenuMark, type MenuSubject } from "./sub-account-menu-verdict.js";

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
 * validations, S3), puis la réservation (S1, S2, S7) et le sur mesure (D3 du
 * § 13). Pure : la ligne lue et le lecteur suffisent.
 *
 * - le public et le personnel n'ont que `servedTo` : S3 y est déjà, et le
 *   personnel voit les réservations (S5) et le sur mesure « à attribuer » ;
 * - les lignes gardées d'une révision (`waiveReservation`) ne relisent ni la
 *   réservation ni le sur mesure : déjà commandées, elles gardent leur minimum ;
 * - 🔴 D3 : un article **sur mesure sans aucune réservation** n'est servi à
 *   aucun pro, anonyme ou reconnu (13.2). Ici et non dans `servedTo`
 *   (13.6, bloquant 1) : le fournil, l'heure limite, les bacs et la saisie
 *   staff lisent `servedTo(item, "pro")` et doivent continuer de le voir ;
 * - un pro anonyme ne voit jamais un article réservé (Q2) ;
 * - un pro reconnu le voit s'il est des réservataires, lui ou son principal
 *   actif (S1) ; sinon `visible_locked` le liste verrouillé, au seul lecteur
 *   qui le demande (S7), et `hidden` le fait disparaître (S2) ;
 * - enfin la carte de son sous-compte (`plan-carte-des-sites.md`, § 3.4),
 *   APRÈS la réservation et après les lignes gardées : elle restreint, elle
 *   n'ouvre jamais. Hors carte, `hidden` rend l'article absent et
 *   `visible_locked` le verrouille, au seul lecteur qui le demande.
 */
export function servedToViewer(
  item: ServableItem,
  reservation: ItemReservation,
  viewer: CatalogViewer,
  subject: MenuSubject,
): ViewerVerdict {
  const verdict = reservationVerdict(item, reservation, viewer);
  if (verdict === "absent" || viewer.kind !== "pro" || menuMarkFor(subject, viewer) === "on") {
    return verdict;
  }
  return viewer.menu?.offMenu === "visible_locked" && viewer.show === "served_and_locked"
    ? "locked"
    : "absent";
}

/**
 * **La marque de carte** d'un article rendu (§ 3.4, § 3.6) : `off` chez un
 * pro dont le sous-compte ne l'ouvre pas (verrouillé), et chez le personnel
 * qui regarde ce sous-compte (étiqueté, jamais retiré). Les lignes gardées
 * d'une révision ne relisent pas la carte.
 */
export function menuMarkFor(subject: MenuSubject, viewer: CatalogViewer): MenuMark {
  if (viewer.kind === "pro") {
    return viewer.waiveReservation === true ? "on" : menuMarkOf(viewer.menu, subject);
  }
  return viewer.kind === "staff" ? menuMarkOf(viewer.menu, subject) : "on";
}

/** Audience, masquages, sur mesure et réservation — sans la carte. */
function reservationVerdict(
  item: ServableItem,
  reservation: ItemReservation,
  viewer: CatalogViewer,
): ViewerVerdict {
  if (!servedTo(item, viewerAudience(viewer))) {
    return "absent";
  }
  if (viewer.kind === "public" || viewer.kind === "staff") {
    return "served";
  }
  if (viewer.kind === "pro" && viewer.waiveReservation === true) {
    return "served";
  }
  if (!item.isReserved) {
    // D3 : sur mesure et attribué à personne — servi à aucun pro.
    return item.isCustomRecipe ? "absent" : "served";
  }
  if (viewer.kind === "pro_anonymous") {
    return "absent";
  }
  if (heldByAny(reservation, holderIds(viewer.holders))) {
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
