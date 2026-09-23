import { SOURCE_LOCALE } from "@lfd/pim-contracts";

import type {
  ProductEditorialView,
  ProductMediaRecord,
} from "../../../catalogue/product/domain/ports/editorial-reader.js";
import type { ProductRecord } from "../../../catalogue/product/domain/ports/product.repository.js";
import type { SyncMedia } from "@lfd/catalog-sync";

import type { Showcase } from "./projection.js";

/**
 * Les **rôles** qu'une vitrine montre — et il y en a DEUX depuis le 2026-09-23.
 *
 * Une boutique affiche une pièce par référence, et le référentiel dit laquelle.
 * Prendre le premier visuel quel qu'il soit ferait dépendre la vitrine de
 * l'ordre de saisie — une photo d'ambiance ajoutée en tête remplacerait le
 * packshot sans que personne ne l'ait décidé.
 *
 * 🔴 `thumbnail` ne traversait pas, et c'était un trou visible depuis
 * l'écran : on pouvait choisir « vignette de rayon (4/3) » et **rien ne se
 * passait**, même après un push. Un écran qui offre un geste sans effet
 * apprend à se méfier de lui.
 *
 * ⚠️ `lifestyle` et `print` restent chez l'émetteur : aucun écran du récepteur
 * ne les demande, et les faire voyager lui donnerait des champs à tenir à jour
 * sans lecteur.
 */
const SHOWCASE_ROLE = "hero";
const THUMBNAIL_ROLE = "thumbnail";

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
      image: mediaOf(medias.get(product.id) ?? [], SHOWCASE_ROLE),
      thumbnail: mediaOf(medias.get(product.id) ?? [], THUMBNAIL_ROLE),
    });
  }
  return showcase;
}

/**
 * Le visuel d'un rôle, ou `null`.
 *
 * Les visuels arrivent déjà ordonnés par position : le premier du rôle est donc
 * celui que le référentiel a mis en tête, et il n'y a pas de second choix à
 * faire. Une fiche qui n'a que des visuels d'ambiance n'en montre aucun —
 * afficher une photo de table à la place d'un croissant serait pire que le vide.
 *
 * ⚠️ **Aucun repli d'un rôle sur l'autre ICI.** L'émetteur dit ce que la fiche
 * PORTE ; c'est au récepteur de décider ce qu'il montre quand un rôle manque.
 * Replier ici ferait voyager deux fois la même image sous deux noms, et le
 * récepteur ne pourrait plus distinguer « vignette choisie » de « vignette
 * déduite ».
 */
function mediaOf(medias: readonly ProductMediaRecord[], role: string): SyncMedia | null {
  const hero = medias.find((media) => media.role === role);
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
