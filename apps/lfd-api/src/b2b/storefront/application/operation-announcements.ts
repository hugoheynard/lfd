import type {
  PublicStorefrontContent,
  PublicStorefrontInfoContent,
  PublicStorefrontObjectView,
  PublicStorefrontPageView,
} from "@lfd/contracts";

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
 * - toute autre annonce porte `operation: null`.
 */
export function resolveOperationAnnouncements(
  page: PublicStorefrontPageView,
  shown: ReadonlyMap<string, ShownOperation>,
): PublicStorefrontPageView {
  return {
    rows: page.rows,
    objects: page.objects.map((object) => resolveObject(object, shown)),
  };
}

function resolveObject(
  object: PublicStorefrontObjectView,
  shown: ReadonlyMap<string, ShownOperation>,
): PublicStorefrontObjectView {
  return {
    ...object,
    contents: object.contents.flatMap((content): PublicStorefrontContent[] => {
      if (content.kind === "product") {
        return [content];
      }
      if (!isLinked(content)) {
        return [{ ...content, operation: null }];
      }
      const operation = shown.get(content.operationKey);
      return operation === undefined ? [] : [inherited(content, operation)];
    }),
  };
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
