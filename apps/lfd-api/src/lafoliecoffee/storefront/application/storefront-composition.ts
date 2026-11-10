import type { StorefrontContent as ContentPayload, StorefrontPayload } from "@lfd/contracts";

import type { IdGenerator } from "../../../platform/id/id-generator.js";
import type { StorefrontContentInput } from "../domain/storefront-content.js";
import { StorefrontObject } from "../domain/storefront-object.js";
import { StorefrontPage } from "../domain/storefront-page.js";
import { StorefrontTemplate } from "../domain/storefront-template.js";
import type { Proposed, StorefrontComposition } from "../domain/storefront.js";

/**
 * Traduit le corps du `PUT` en composition du domaine : chaque objet, page et
 * gabarit passe par son value object — un refus de forme tombe ici, AVANT
 * toute transaction.
 *
 * Un objet ou un gabarit sans `id` est NEUF : le serveur l'identifie (ULID).
 * Un `id` fourni doit être dans la vitrine chargée — c'est l'agrégat qui le
 * vérifie, parce que lui seul la connaît.
 */
export function compositionOf(payload: StorefrontPayload, ids: IdGenerator): StorefrontComposition {
  return {
    expectedRevision: payload.revision,
    pages: payload.pages.map((page) => StorefrontPage.of(page)),
    objects: payload.objects.map((object) =>
      proposed(object.id, ids, (id) =>
        StorefrontObject.of({
          id,
          settings: object,
          column: object.column,
          row: object.row,
          shelves: object.shelves,
          contents: object.contents.map(contentState),
        }),
      ),
    ),
    templates: payload.templates.map((template) =>
      proposed(template.id, ids, (id) =>
        StorefrontTemplate.of({
          id,
          name: template.name,
          description: template.description,
          settings: template,
        }),
      ),
    ),
  };
}

function proposed<T>(
  id: string | undefined,
  ids: IdGenerator,
  build: (id: string) => T,
): Proposed<T> {
  return id === undefined
    ? { value: build(ids.next()), isNew: true }
    : { value: build(id), isNew: false };
}

/** Le contenu du contrat, en primitives du domaine (les champs facultatifs restent absents). */
function contentState(content: ContentPayload): StorefrontContentInput {
  if (content.kind === "product") {
    return { kind: "product", sku: content.sku };
  }
  return {
    kind: "info",
    badge: content.badge,
    title: content.title,
    lede: content.lede,
    image: content.image,
    linkShelfKey: content.linkShelfKey,
    operationKey: content.operationKey,
    action: content.action,
  };
}
