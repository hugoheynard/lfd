import { viewerHolderIds, type CatalogViewer } from "../domain/catalog-viewer.js";
import { catalogAudienceOf, type ServableItem } from "../domain/served-to.js";
import {
  reservationMarkOf,
  servedToViewer,
  type CatalogReservationMark,
  type ItemReservation,
} from "../domain/served-to-viewer.js";
import { DECISION_COLUMNS } from "./catalog-decision-columns.js";
import { reservedVisibilityOf } from "./reserved-visibility-column.js";

/**
 * Les colonnes de décision, plus le réglage sur mesure — ce que le mur lit sur
 * `catalog_item_overrides` (`plan-articles-sur-mesure.md`, § 4).
 */
export const ACCESS_DECISION_COLUMNS = {
  ...DECISION_COLUMNS,
  isMadeToOrder: true,
  reservedVisibility: true,
} as const;

/**
 * **Les deux questions de la réservation, dans la lecture même** (§ 5) :
 * « est-il réservé ? » (`_count`) et « à qui, parmi les sociétés de ce
 * lecteur ? » (la relation filtrée). Un `include` : le compteur d'opérations
 * (`SchemaOpsCounter`) compte un appel ORM, pas une jointure.
 *
 * Un lecteur sans société ne pose que la première : la liste filtrée sur
 * `in: []` est vide par construction.
 */
export function reservationInclude(viewer: CatalogViewer) {
  return {
    _count: { select: { reservations: true as const } },
    reservations: {
      where: { companyId: { in: [...viewerHolderIds(viewer)] } },
      select: { companyId: true as const },
    },
  };
}

/** Ce que le mur lit d'une ligne d'article. */
export interface AccessRow {
  readonly audience: string | null;
  readonly publicReviewPending: boolean;
  readonly proReviewPending: boolean;
  readonly override: {
    readonly isHidden: boolean;
    readonly isHiddenPublic: boolean;
    readonly isMadeToOrder: boolean;
    readonly reservedVisibility: string;
  } | null;
  readonly _count: { readonly reservations: number };
  readonly reservations: readonly { readonly companyId: string }[];
}

/** Le verdict du lecteur, et l'étiquette quand l'article est rendu. */
export interface ItemAccess {
  readonly verdict: "served" | "locked" | "absent";
  readonly mark: CatalogReservationMark;
}

/** `servedToViewer`, la règle du domaine, appliquée à une ligne lue. */
export function accessOf(row: AccessRow, viewer: CatalogViewer): ItemAccess {
  const item: ServableItem = {
    audience: catalogAudienceOf(row.audience),
    isHidden: row.override?.isHidden ?? false,
    isHiddenPublic: row.override?.isHiddenPublic ?? false,
    publicReviewPending: row.publicReviewPending,
    proReviewPending: row.proReviewPending,
    isReserved: row._count.reservations > 0,
    isMadeToOrder: row.override?.isMadeToOrder ?? false,
  };
  const reservation: ItemReservation = {
    heldBy: row.reservations.map((entry) => entry.companyId),
    visibility: reservedVisibilityOf(row.override?.reservedVisibility),
  };
  return {
    verdict: servedToViewer(item, reservation, viewer),
    mark: reservationMarkOf(item, reservation, viewer),
  };
}
