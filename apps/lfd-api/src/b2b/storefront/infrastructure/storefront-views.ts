import type {
  PublicStorefrontObjectView,
  StorefrontContent,
  StorefrontObjectView,
  StorefrontTemplateView,
} from "@lfd/contracts";

import type { StorefrontContentState } from "../domain/storefront-content.js";
import type { StorefrontObjectState } from "../domain/storefront-object.js";
import type { StorefrontTemplateState } from "../domain/storefront-template.js";

/**
 * Les états VALIDÉS du domaine, en vues du contrat. Les lecteurs relisent les
 * lignes à travers les value objects avant de les servir : une ligne écrite
 * hors de l'application ne part pas vers l'écran sans avoir été revérifiée.
 */

export function objectView(object: StorefrontObjectState): StorefrontObjectView {
  return {
    id: object.id,
    ...object.settings,
    column: object.column,
    row: object.row,
    shelves: [...object.shelves],
    contents: object.contents.map(contentView),
  };
}

export function templateView(template: StorefrontTemplateState): StorefrontTemplateView {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    ...template.settings,
  };
}

/**
 * Un objet pour la boutique : ni rayons, ni nombre de contenus simulé, et le
 * défilement seulement s'il est EN VIGUEUR — conservé mais inactif, il ne
 * regarde que l'éditeur.
 */
export function publicObjectView(object: StorefrontObjectState): PublicStorefrontObjectView {
  const { carousel, ...settings } = object.settings;
  return {
    id: object.id,
    shape: settings.shape,
    column: object.column,
    row: object.row,
    applyOnMobile: settings.applyOnMobile,
    mediaFit: settings.mediaFit,
    mediaSide: settings.mediaSide,
    carousel: settings.multiple
      ? {
          nav: carousel.nav,
          autoplay: carousel.autoplay,
          intervalSeconds: carousel.intervalSeconds,
          firstSeconds: carousel.firstSeconds,
        }
      : null,
    tone: settings.tone,
    contents: object.contents.map(contentView),
  };
}

function contentView(content: StorefrontContentState): StorefrontContent {
  return content.kind === "product" ? { kind: "product", sku: content.sku } : { ...content };
}
