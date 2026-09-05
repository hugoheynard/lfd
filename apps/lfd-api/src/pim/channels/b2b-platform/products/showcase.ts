import { SOURCE_LOCALE } from "@lfd/pim-contracts";

import type {
  ProductEditorialView,
  ProductMediaRecord,
} from "../../../catalogue/product/domain/ports/editorial-reader.js";
import type { ProductRecord } from "../../../catalogue/product/domain/ports/product.repository.js";
import type { Showcase } from "./projection.js";

/**
 * Le **rôle** du visuel qu'une vitrine montre.
 *
 * Une boutique affiche une pièce par référence, et le référentiel dit laquelle :
 * `hero`. Prendre le premier visuel quel qu'il soit ferait dépendre la vitrine
 * de l'ordre de saisie — une photo d'ambiance ajoutée en tête remplacerait le
 * packshot sans que personne ne l'ait décidé.
 */
const SHOWCASE_ROLE = "hero";

/**
 * Ce que chaque fiche montrera, réduit à une ligne et une pièce.
 *
 * Fabriqué ici plutôt que dans la projection, qui est pure et qui n'a pas à
 * savoir qu'un éditorial porte sept lignes ni qu'un produit porte cinq rôles de
 * visuel. Elle reçoit ce qui traverse ; le tri est un fait de canal.
 *
 * Une fiche absente de la carte n'est pas une erreur : c'est le cas courant
 * d'un produit sans éditorial ni photo, et le fil le transporte en `null`.
 */
export function showcaseOf(
  products: readonly ProductRecord[],
  notes: ReadonlyMap<string, ProductEditorialView>,
  medias: ReadonlyMap<string, readonly ProductMediaRecord[]>,
): ReadonlyMap<string, Showcase> {
  const showcase = new Map<string, Showcase>();
  for (const product of products) {
    showcase.set(product.id, {
      note: notes.get(product.id)?.descriptionShort?.[SOURCE_LOCALE] ?? null,
      image: heroOf(medias.get(product.id) ?? []),
    });
  }
  return showcase;
}

/**
 * Le packshot, ou `null`.
 *
 * Les visuels arrivent déjà ordonnés par position : le premier `hero` est donc
 * celui que le référentiel a mis en tête, et il n'y a pas de second choix à
 * faire. Une fiche qui n'a que des visuels d'ambiance n'en montre aucun —
 * afficher une photo de table à la place d'un croissant serait pire que le vide.
 */
function heroOf(medias: readonly ProductMediaRecord[]): Showcase["image"] {
  const hero = medias.find((media) => media.role === SHOWCASE_ROLE);
  if (hero === undefined) {
    return null;
  }
  return {
    url: hero.url,
    alt: hero.alt[SOURCE_LOCALE] ?? "",
    width: hero.width,
    height: hero.height,
  };
}
