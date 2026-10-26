import { CatalogItem } from "../domain/entities/catalog-item.js";
import { catalogAudienceOf } from "../domain/served-to.js";
import { allergenLabelsOf } from "./allergen-labels.js";
import { publicByContextOf } from "./public-by-context.js";
import { servedImageAlt } from "./catalog-image-alt.js";

/** La ligne telle que Prisma la rend, décision jointe. Aucun type `Prisma.*` exporté. */
export interface ItemRow {
  readonly sku: string;
  readonly productId: string;
  readonly productSku: string;
  readonly name: string;
  readonly kind: string;
  readonly categoryId: string;
  readonly priceMillicents: number;
  readonly weightGrams: number | null;
  readonly isDefault: boolean;
  readonly position: number;
  readonly vatRatePercent: { toNumber(): number } | null;
  readonly publicTtcCents: number | null;
  readonly publicByContext: unknown;
  readonly allergens: unknown;
  readonly allergenLabels: unknown;
  readonly note: string | null;
  readonly imageUrl: string | null;
  readonly thumbnailUrl: string | null;
  readonly thumbnailAlt: string | null;
  readonly thumbnailWidth: number | null;
  readonly thumbnailHeight: number | null;
  readonly imageAlt: string | null;
  readonly imageWidth: number | null;
  readonly imageHeight: number | null;
  readonly imageFocalX: number | null;
  readonly imageFocalY: number | null;
  readonly thumbnailFocalX: number | null;
  readonly thumbnailFocalY: number | null;
  readonly orderLimitDaysBefore: number | null;
  readonly orderLimitTime: string | null;
  readonly orderLimitGraceMinutes: number | null;
  readonly operationOnly: boolean;
  readonly requiresCold: boolean;
  readonly receivedAt: Date;
  readonly withdrawnAt: Date | null;
  readonly audience: string | null;
  readonly publicReviewPending: boolean;
  readonly proReviewPending: boolean;
  readonly override: {
    readonly isHidden: boolean;
    readonly isHiddenPublic: boolean;
    readonly isFeaturedPro: boolean;
    readonly isFeaturedPublic: boolean;
    readonly decidedBy: string | null;
  } | null;
}

/**
 * Les trois colonnes de limite ↔ un objet, ou `null`.
 *
 * **Tout ou rien** : il suffit qu'une des trois manque pour qu'il n'y ait pas de
 * limite. Une limite sans heure ne se compare à rien, et reconstruire un objet
 * partiel donnerait au commerce une règle qu'il croirait pouvoir appliquer.
 * L'ingestion les écrit ensemble ; cette lecture-ci refuse de recoller ce qui
 * aurait été séparé à la main.
 */
function orderTimeLimitOf(row: ItemRow) {
  const { orderLimitDaysBefore, orderLimitTime, orderLimitGraceMinutes } = row;
  if (orderLimitDaysBefore === null || orderLimitTime === null || orderLimitGraceMinutes === null) {
    return null;
  }
  return {
    daysBefore: orderLimitDaysBefore,
    time: orderLimitTime,
    graceMinutes: orderLimitGraceMinutes,
  };
}

/**
 * Le packshot, ou `null`.
 *
 * L'URL commande : sans elle il n'y a rien à afficher, et les trois autres
 * colonnes ne décrivent alors plus rien. Les dimensions, elles, restent
 * légitimement nulles — « pas mesuré » est un état, pas un trou.
 */
function imageOf(row: ItemRow) {
  if (row.imageUrl === null) {
    return null;
  }
  return {
    url: row.imageUrl,
    alt: servedImageAlt(row.imageAlt),
    width: row.imageWidth,
    height: row.imageHeight,
    focal: focalOf(row.imageFocalX, row.imageFocalY),
  };
}

/**
 * La vignette de rayon, ou `null`. Même mécanique et même raison que le
 * packshot : l'URL commande.
 */
function thumbnailOf(row: ItemRow) {
  if (row.thumbnailUrl === null) {
    return null;
  }
  return {
    url: row.thumbnailUrl,
    alt: servedImageAlt(row.thumbnailAlt),
    width: row.thumbnailWidth,
    height: row.thumbnailHeight,
    focal: focalOf(row.thumbnailFocalX, row.thumbnailFocalY),
  };
}

/** Ligne ↔ agrégat. La décision absente devient « rien décidé », pas `undefined`. */
export function toDomain(row: ItemRow): CatalogItem {
  return CatalogItem.reconstitute({
    facts: {
      sku: row.sku,
      productId: row.productId,
      productSku: row.productSku,
      name: row.name,
      kind: row.kind,
      categoryId: row.categoryId,
      priceMillicents: row.priceMillicents,
      weightGrams: row.weightGrams,
      isDefault: row.isDefault,
      position: row.position,
      // `Decimal` → `number` : le domaine ne connaît pas le type de l'ORM.
      vatRatePercent: row.vatRatePercent === null ? null : row.vatRatePercent.toNumber(),
      publicTtcCents: row.publicTtcCents,
      publicByContext: publicByContextOf(row.publicByContext),
      allergens: allergensOf(row.allergens),
      allergenLabels: allergenLabelsOf(row.allergenLabels),
      orderTimeLimit: orderTimeLimitOf(row),
      note: row.note,
      image: imageOf(row),
      thumbnail: thumbnailOf(row),
      operationOnly: row.operationOnly,
      requiresCold: row.requiresCold,
      receivedAt: row.receivedAt,
    },
    withdrawnAt: row.withdrawnAt,
    placement: {
      audience: catalogAudienceOf(row.audience),
      publicReviewPending: row.publicReviewPending,
      proReviewPending: row.proReviewPending,
    },
    decision:
      row.override === null
        ? null
        : {
            isHidden: row.override.isHidden,
            isHiddenPublic: row.override.isHiddenPublic,
            isFeaturedPro: row.override.isFeaturedPro,
            isFeaturedPublic: row.override.isFeaturedPublic,
            decidedBy: row.override.decidedBy,
          },
  });
}

/**
 * La colonne `jsonb` relue en liste de codes.
 *
 * Tout ce qui n'est pas un tableau de chaînes rend `null` — « pas de fiche »
 * plutôt qu'une fiche vide. Sur un champ réglementé, la valeur par défaut doit
 * être celle qui n'affirme RIEN.
 */
function allergensOf(raw: unknown): readonly string[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  return raw.filter((code): code is string => typeof code === "string");
}

/** Les deux colonnes du point focal, ou `null` : une moitié de point ne désigne rien. */
function focalOf(x: number | null, y: number | null): { x: number; y: number } | null {
  return x === null || y === null ? null : { x, y };
}
