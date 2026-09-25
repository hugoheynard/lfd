import type {
  PublicStorefrontContent,
  PublicStorefrontInfoContent,
  PublicStorefrontObjectView,
  PublicStorefrontPageView,
} from "@lfd/contracts";

import { OPERATION_SHELF_PREFIX } from "../domain/operation-link.js";
import type { ShownOperation } from "../domain/storefront-operations.reader.js";

/** La page porte-t-elle au moins une annonce liée à une opération ? */
export function hasOperationAnnouncements(page: PublicStorefrontPageView): boolean {
  return page.objects.some((object) =>
    object.contents.some((content) => content.kind === "info" && isLinked(content)),
  );
}

/**
 * **Les annonces d'une page, résolues contre les opérations montrées** (D11 de
 * `documentation/order/architecture-operations-datees.md`).
 *
 * - une annonce dont l'opération n'est pas montrée — inconnue, retirée,
 *   masquée, hors fenêtre, ou pour une autre clientèle — est OMISE : elle
 *   s'éteint avec son opération. L'objet garde ses autres contenus ; s'il n'en
 *   a plus, il rend ses cases au rayon (`isRenderable`) ;
 * - une annonce montrée hérite ce qu'elle laisse vide (titre, phrase, image)
 *   et porte `operation` : la boutique en calcule le badge quand `badge` est
 *   `null`, et ouvre le rayon `op:<key>` au clic ;
 * - toute autre annonce porte `operation: null` ;
 * - **une annonce n'a pas sa place dans le rayon qu'elle annonce** : sur la
 *   page `op:<key>`, ce qui annonce `<key>` — lié à l'opération, ou ouvrant
 *   son rayon — est omis. L'objet paraît donc « partout sauf là » sans que
 *   l'éditeur ait à tenir la liste (Hugo, 2026-09-25) : une famille ajoutée
 *   plus tard n'y change rien, et une liste de rayons oubliée non plus.
 */
export function resolveOperationAnnouncements(
  page: PublicStorefrontPageView,
  shown: ReadonlyMap<string, ShownOperation>,
  shelfKey: string,
): PublicStorefrontPageView {
  return {
    rows: page.rows,
    objects: page.objects.map((object) => resolveObject(object, shown, shelfKey)),
  };
}

function resolveObject(
  object: PublicStorefrontObjectView,
  shown: ReadonlyMap<string, ShownOperation>,
  shelfKey: string,
): PublicStorefrontObjectView {
  return {
    ...object,
    contents: object.contents.flatMap((content): PublicStorefrontContent[] => {
      if (content.kind === "product") {
        return [content];
      }
      if (announces(content, shelfKey)) {
        return [];
      }
      if (!isLinked(content)) {
        return [{ ...content, operation: null }];
      }
      const operation = shown.get(content.operationKey);
      return operation === undefined ? [] : [inherited(content, operation)];
    }),
  };
}

/** L'annonce désigne-t-elle le rayon d'opération qu'on sert ? */
function announces(content: PublicStorefrontInfoContent, shelfKey: string): boolean {
  if (!shelfKey.startsWith(OPERATION_SHELF_PREFIX)) {
    return false;
  }
  const key = shelfKey.slice(OPERATION_SHELF_PREFIX.length);
  return content.operationKey === key || content.linkShelfKey === shelfKey;
}

function isLinked(
  content: PublicStorefrontInfoContent,
): content is PublicStorefrontInfoContent & { readonly operationKey: string } {
  return content.operationKey !== undefined && content.operationKey !== null;
}

function inherited(
  content: PublicStorefrontInfoContent,
  operation: ShownOperation,
): PublicStorefrontInfoContent {
  return {
    ...content,
    title: content.title.fr === "" ? operation.name : content.title,
    lede: content.lede ?? operation.lede,
    image: content.image ?? imageOf(operation.image),
    operation: {
      key: operation.key,
      state: operation.state,
      orderFrom: operation.orderFrom.toISOString(),
      orderUntil: operation.orderUntil.toISOString(),
      pickupFrom: operation.pickupFrom,
      pickupUntil: operation.pickupUntil,
    },
  };
}

/** L'image de l'opération au format de la vitrine : un texte alternatif vide n'en est pas un. */
function imageOf(image: ShownOperation["image"]): PublicStorefrontInfoContent["image"] {
  if (image === null) {
    return null;
  }
  return { url: image.url, alt: image.alt.trim() === "" ? null : { fr: image.alt } };
}
