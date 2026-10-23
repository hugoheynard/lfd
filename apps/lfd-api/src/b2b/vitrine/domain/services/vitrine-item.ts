import {
  productUrl,
  type ShopImageView,
  type ShopItemView,
  type VitrineItemView,
  type VitrineThumbnailView,
} from "@lfd/contracts";
import { unitPriceCents } from "@lfd/money";

const CENTS_PER_EURO = 100;
const FOCAL_DECIMALS = 2;

/**
 * Des centimes entiers → « 12,32 » : virgule décimale, deux décimales, sans
 * symbole ni séparateur de milliers. L'argent reste entier jusqu'ici.
 */
export function euroText(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  const euros = Math.trunc(absolute / CENTS_PER_EURO);
  return `${sign}${String(euros)},${String(absolute % CENTS_PER_EURO).padStart(2, "0")}`;
}

/** Le point focal en `"x,y"` (« 0.50,0.30 »), ou `""` s'il n'y en a pas. */
export function focaleOf(image: ShopImageView): string {
  const focal = image.focal;
  if (focal === null || focal === undefined) {
    return "";
  }
  return `${focal.x.toFixed(FOCAL_DECIMALS)},${focal.y.toFixed(FOCAL_DECIMALS)}`;
}

/**
 * Le texte alternatif servi : celui de la médiathèque, ou le nom de
 * l'article quand il n'y en a pas d'écrit.
 *
 * La médiathèque replie une alternative absente sur l'URL de l'image, pour
 * qu'elle se VOIE à l'écran du staff (`media/infrastructure/library-rows.ts`,
 * `prisma-image-catalogue.ts`, vérifié le 2026-10-23) ; ce repli descend
 * jusqu'à la vue publique. Une URL n'est pas une alternative : l'agence la
 * recevait dans `<alt>`.
 */
export function altOf(image: ShopImageView, itemName: string): string {
  const alt = image.alt.trim();
  return alt === "" || alt === image.url ? itemName : image.alt;
}

function imageFor(image: ShopImageView | null, itemName: string): ShopImageView | null {
  return image === null ? null : { ...image, alt: altOf(image, itemName) };
}

function thumbnailFor(image: ShopImageView | null, itemName: string): VitrineThumbnailView | null {
  return image === null ? null : { ...image, alt: altOf(image, itemName), focale: focaleOf(image) };
}

/** Ce qu'un article emprunte au reste du flux : les rayons, l'origine de la boutique. */
export interface VitrineItemContext {
  readonly shelfNames: ReadonlyMap<string, string>;
  /** `null` = origine non configurée : `URLProduct` est servie vide. */
  readonly shopOrigin: string | null;
}

/**
 * Les champs que l'agence lit en plus de la vue de la boutique (2026-10-23) :
 * les prix écrits en euros, le nom du rayon, la focale de la vignette, un
 * `alt` qui n'est jamais une URL, et l'adresse absolue de la fiche
 * (`URLProduct`, construite par `productUrl`, la même que la boutique sert). Rien n'est retiré : `isFeatured` et
 * `operation` se décident à côté, selon les cases de l'abonné.
 *
 * Un rayon absent de `shelves` rend un nom vide plutôt qu'un nom inventé ;
 * une origine absente, une adresse vide plutôt qu'une adresse relative.
 */
export function vitrineItemOf(
  item: Omit<ShopItemView, "isFeatured" | "operation">,
  context: VitrineItemContext,
): Omit<VitrineItemView, "isFeatured" | "operation"> {
  return {
    ...item,
    image: imageFor(item.image, item.name),
    thumbnail: thumbnailFor(item.thumbnail, item.name),
    unitPriceTTC: euroText(item.unitPriceTtcCents),
    unitPriceHT: euroText(unitPriceCents(item.unitPriceMillicents)),
    shelfName: context.shelfNames.get(item.shelfId) ?? "",
    URLProduct: productUrl(context.shopOrigin, item.sku) ?? "",
  };
}
