import { ShelfKey } from "./shelf-key.js";
import { InvalidStorefrontError } from "./storefront-errors.js";
import {
  STOREFRONT_TEXT_FIELDS,
  StorefrontText,
  type StorefrontTextState,
} from "./storefront-text.js";

const SKU_MAX = 64;
const IMAGE_URL_MAX = 2048;

/** Un contenu produit, en primitives : le SKU, et lui seul. */
export interface ProductContentState {
  readonly kind: "product";
  readonly sku: string;
}

/** Un contenu info, en primitives. */
export interface InfoContentState {
  readonly kind: "info";
  readonly badge: StorefrontTextState | null;
  readonly title: StorefrontTextState;
  readonly lede: StorefrontTextState | null;
  readonly image: { readonly url: string; readonly alt: StorefrontTextState | null } | null;
  readonly linkShelfKey: string | null;
}

export type StorefrontContentState = ProductContentState | InfoContentState;

/**
 * **Un contenu d'objet** — un produit ou une info (`boutique-rayon-layout.md`,
 * « Le contenu s'associe ensuite »).
 *
 * Un produit ne porte QUE son SKU (plan, D4) : la boutique le résout dans le
 * catalogue qu'elle a déjà, et un prix recopié ici dériverait. Un SKU que le
 * catalogue ne sert plus n'est pas refusé — il n'est pas rendu, et l'éditeur
 * le marque « plus en vente ».
 */
export class StorefrontContent {
  private constructor(readonly state: StorefrontContentState) {}

  /** @throws {InvalidStorefrontError} SKU vide, texte refusé, image sans adresse. */
  static of(input: StorefrontContentState): StorefrontContent {
    return new StorefrontContent(input.kind === "product" ? product(input) : info(input));
  }

  get kind(): StorefrontContentState["kind"] {
    return this.state.kind;
  }
}

function product(input: ProductContentState): ProductContentState {
  const sku = input.sku.trim();
  if (sku === "" || sku.length > SKU_MAX) {
    throw new InvalidStorefrontError(
      "sku",
      "Un contenu produit désigne un article du catalogue : choisissez-en un.",
    );
  }
  return { kind: "product", sku };
}

function info(input: InfoContentState): InfoContentState {
  const text = (value: StorefrontTextState | null, field: keyof typeof STOREFRONT_TEXT_FIELDS) =>
    value === null ? null : StorefrontText.of(value, STOREFRONT_TEXT_FIELDS[field]).toPersistence();
  return {
    kind: "info",
    badge: text(input.badge, "badge"),
    title: StorefrontText.of(input.title, STOREFRONT_TEXT_FIELDS.title).toPersistence(),
    lede: text(input.lede, "lede"),
    image: input.image === null ? null : image(input.image.url, text(input.image.alt, "imageAlt")),
    linkShelfKey: input.linkShelfKey === null ? null : ShelfKey.of(input.linkShelfKey).value,
  };
}

function image(url: string, alt: StorefrontTextState | null): InfoContentState["image"] {
  const trimmed = url.trim();
  if (trimmed === "" || trimmed.length > IMAGE_URL_MAX) {
    throw new InvalidStorefrontError(
      "image",
      "L'image d'une info vient de la médiathèque : choisissez-en une, ou retirez l'image.",
    );
  }
  return { url: trimmed, alt };
}
