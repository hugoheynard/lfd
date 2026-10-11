import type { Prisma } from "../../../platform/database/client/client.js";
import type { StorefrontImageInput, StorefrontImageState } from "../domain/storefront-image.js";
import type { StorefrontPageInput, StorefrontPageState } from "../domain/storefront-page.js";
import { focalOf, jsonOf, textOf, type NullableJson } from "./storefront-rows.js";

/**
 * Les mappers ligne ↔ domaine d'une PAGE de la vitrine et de ses deux images
 * de porte (retrait, livraison) — sortis de `storefront-rows.ts` le
 * 2026-10-11, quand la porte livraison a doublé leurs colonnes.
 */

export interface PageRow {
  readonly shelfKey: string;
  readonly rows: number;
  readonly pickupDoorImageUrl: string | null;
  readonly pickupDoorImageAlt: Prisma.JsonValue;
  readonly pickupDoorFocalX: number | null;
  readonly pickupDoorFocalY: number | null;
  readonly deliveryDoorImageUrl: string | null;
  readonly deliveryDoorImageAlt: Prisma.JsonValue;
  readonly deliveryDoorFocalX: number | null;
  readonly deliveryDoorFocalY: number | null;
}

/** L'image d'une porte, lue de ses quatre colonnes — `null` sans url. */
function doorInputOf(
  url: string | null,
  alt: Prisma.JsonValue,
  focalX: number | null,
  focalY: number | null,
): StorefrontImageInput | null {
  return url === null ? null : { url, alt: textOf(alt), focal: focalOf(focalX, focalY) };
}

export function pageInputOf(row: PageRow): StorefrontPageInput {
  return {
    shelfKey: row.shelfKey,
    rows: row.rows,
    pickupDoorImage: doorInputOf(
      row.pickupDoorImageUrl,
      row.pickupDoorImageAlt,
      row.pickupDoorFocalX,
      row.pickupDoorFocalY,
    ),
    deliveryDoorImage: doorInputOf(
      row.deliveryDoorImageUrl,
      row.deliveryDoorImageAlt,
      row.deliveryDoorFocalX,
      row.deliveryDoorFocalY,
    ),
  };
}

/** Les quatre colonnes d'une image de porte, sans leur préfixe. */
function doorColumnsOf(image: StorefrontImageState | null): {
  readonly url: string | null;
  readonly alt: NullableJson;
  readonly focalX: number | null;
  readonly focalY: number | null;
} {
  return {
    url: image?.url ?? null,
    alt: jsonOf(image?.alt ?? null),
    focalX: image?.focal?.x ?? null,
    focalY: image?.focal?.y ?? null,
  };
}

/** Les colonnes d'une page, pour l'écriture. */
export function pageColumns(page: StorefrontPageState): {
  readonly shelfKey: string;
  readonly rows: number;
  readonly pickupDoorImageUrl: string | null;
  readonly pickupDoorImageAlt: NullableJson;
  readonly pickupDoorFocalX: number | null;
  readonly pickupDoorFocalY: number | null;
  readonly deliveryDoorImageUrl: string | null;
  readonly deliveryDoorImageAlt: NullableJson;
  readonly deliveryDoorFocalX: number | null;
  readonly deliveryDoorFocalY: number | null;
} {
  const pickup = doorColumnsOf(page.pickupDoorImage);
  const delivery = doorColumnsOf(page.deliveryDoorImage);
  return {
    shelfKey: page.shelfKey,
    rows: page.rows,
    pickupDoorImageUrl: pickup.url,
    pickupDoorImageAlt: pickup.alt,
    pickupDoorFocalX: pickup.focalX,
    pickupDoorFocalY: pickup.focalY,
    deliveryDoorImageUrl: delivery.url,
    deliveryDoorImageAlt: delivery.alt,
    deliveryDoorFocalX: delivery.focalX,
    deliveryDoorFocalY: delivery.focalY,
  };
}
