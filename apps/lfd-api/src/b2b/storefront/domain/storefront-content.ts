import { LinkedOperationKey } from "./operation-link.js";
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

/**
 * Ce que fait une annonce au clic (D11 de `architecture-operations-datees.md`).
 * Jamais stocké : il se DÉDUIT des cibles ({@link infoActionOf}), pour qu'une
 * action et sa cible ne puissent pas se contredire en base.
 */
export type InfoAction = "none" | "shelf" | "operation";

/**
 * Un contenu info (une annonce), en primitives VALIDÉES.
 *
 * `title: null` n'existe que sur une annonce liée à une opération : le titre
 * est alors HÉRITÉ, comme `badge`, `lede` et `image` à `null`.
 */
export interface InfoContentState {
  readonly kind: "info";
  readonly badge: StorefrontTextState | null;
  readonly title: StorefrontTextState | null;
  readonly lede: StorefrontTextState | null;
  readonly image: { readonly url: string; readonly alt: StorefrontTextState | null } | null;
  readonly linkShelfKey: string | null;
  readonly operationKey: string | null;
}

/**
 * Une annonce telle qu'elle arrive — de l'éditeur ou d'une ligne relue.
 * `operationKey` absent : un éditeur d'avant les opérations. `action` absente :
 * déduite ; présente, elle doit dire la même chose que les cibles. Un titre
 * sans aucun texte vaut « hérité ».
 */
export interface InfoContentInput extends Omit<InfoContentState, "operationKey"> {
  readonly operationKey?: string | null | undefined;
  readonly action?: InfoAction | undefined;
}

export type StorefrontContentState = ProductContentState | InfoContentState;
export type StorefrontContentInput = ProductContentState | InfoContentInput;

/** L'action d'une annonce, lue sur ses cibles. */
export function infoActionOf(targets: {
  readonly linkShelfKey: string | null;
  readonly operationKey?: string | null | undefined;
}): InfoAction {
  if (targets.operationKey !== undefined && targets.operationKey !== null) {
    return "operation";
  }
  return targets.linkShelfKey === null ? "none" : "shelf";
}

/**
 * **Un contenu d'objet** — un produit ou une info (`boutique-rayon-layout.md`,
 * « Le contenu s'associe ensuite »).
 *
 * Un produit ne porte QUE son SKU (plan, D4) : la boutique le résout dans le
 * catalogue qu'elle a déjà, et un prix recopié ici dériverait. Un SKU que le
 * catalogue ne sert plus n'est pas refusé — il n'est pas rendu, et l'éditeur
 * le marque « plus en vente ».
 *
 * Une annonce liée à une opération (D11) n'est pas refusée quand l'opération
 * est inconnue du miroir : seule la forme de sa clé l'est
 * ({@link LinkedOperationKey}).
 */
export class StorefrontContent {
  private constructor(readonly state: StorefrontContentState) {}

  /**
   * @throws {InvalidStorefrontError} SKU vide, texte refusé, image sans
   *   adresse, titre absent hors opération, clé d'opération mal formée, deux
   *   cibles à la fois, action qui contredit sa cible.
   */
  static of(input: StorefrontContentInput): StorefrontContent {
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

function info(input: InfoContentInput): InfoContentState {
  const text = (value: StorefrontTextState | null, field: keyof typeof STOREFRONT_TEXT_FIELDS) =>
    value === null ? null : StorefrontText.of(value, STOREFRONT_TEXT_FIELDS[field]).toPersistence();
  const operationKey = input.operationKey ?? null;
  const targets = {
    linkShelfKey: input.linkShelfKey === null ? null : ShelfKey.of(input.linkShelfKey).value,
    operationKey: operationKey === null ? null : LinkedOperationKey.of(operationKey).value,
  };
  ensureOneTarget(targets, input.action);
  return {
    kind: "info",
    badge: text(input.badge, "badge"),
    title: title(input.title, targets.operationKey !== null),
    lede: text(input.lede, "lede"),
    image: input.image === null ? null : image(input.image.url, text(input.image.alt, "imageAlt")),
    ...targets,
  };
}

/**
 * Le titre : obligatoire en français, sauf sur une annonce liée à une
 * opération, où son absence vaut héritage (`null`). Une traduction sans
 * français reste refusée : l'héritage est tout ou rien.
 */
function title(input: StorefrontTextState | null, inherits: boolean): StorefrontTextState | null {
  const blank = input === null || [input.fr, input.en, input.it].every(isBlank);
  if (blank && inherits) {
    return null;
  }
  return StorefrontText.of(input ?? { fr: "" }, STOREFRONT_TEXT_FIELDS.title).toPersistence();
}

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

/** Le refus, selon l'action annoncée que les cibles contredisent. */
const ACTION_MISMATCH: Readonly<Record<InfoAction, string>> = {
  none: "Une annonce qui n'ouvre rien ne porte pas de cible : retirez-la, ou changez l'action.",
  shelf: "Une annonce qui ouvre un rayon doit le désigner : choisissez-le, ou changez l'action.",
  operation:
    "Une annonce qui ouvre une opération doit la désigner : choisissez-la, ou changez l'action.",
};

function ensureOneTarget(
  targets: { readonly linkShelfKey: string | null; readonly operationKey: string | null },
  action: InfoAction | undefined,
): void {
  if (targets.linkShelfKey !== null && targets.operationKey !== null) {
    throw new InvalidStorefrontError(
      "action",
      "Une annonce ouvre un rayon OU une opération, pas les deux : retirez l'une des deux cibles.",
    );
  }
  if (action !== undefined && action !== infoActionOf(targets)) {
    throw new InvalidStorefrontError("action", ACTION_MISMATCH[action]);
  }
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
