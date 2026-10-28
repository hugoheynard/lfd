import type { ShopImageFocal, ShopImageView, ShopItemView } from '@lfd/contracts';

import { HOUSE_MARK } from './house-mark/house-mark';
import { DECORATIVE_ALT, imageAlt } from './image-alt';

/**
 * **Ce que la vitrine ajoute au catalogue**, et que le référentiel ne dit pas
 * encore.
 *
 * ⚠️ Contenu de MAISON, pas donnée de démonstration. Ce fichier ne remplace
 * aucun fait du serveur : les noms, les prix, les taux, les rayons, la ligne de
 * vitrine et le packshot arrivent tous du catalogue hydraté. Ce qui reste ici,
 * c'est le repli d'une pièce sans photo : le logo de la maison.
 */

/**
 * Le repli d'un article sans photo : le logo de la maison, décoratif (le nom
 * de l'article est écrit à côté). Il remplace depuis le 2026-10-28 (Hugo)
 * l'illustration dessinée du rayon ; c'est `HouseMark` qui le cadre.
 */
export function houseMarkArt(): ShopImageView {
  return { url: HOUSE_MARK, alt: DECORATIVE_ALT, width: null, height: null };
}

/**
 * Le visuel d'un article **en ouverture de fiche** : celui du référentiel,
 * sinon le logo de la maison.
 *
 * Le repli est nommé et non silencieux : une vitrine sans photo montre la
 * marque plutôt qu'un cadre vide, en image décorative — pas d'alternative qui
 * mentirait sur une photo qui n'existe pas.
 */
export function artOf(item: ShopItemView): ShopImageView {
  return item.image ? named(item.image, item.name) : houseMarkArt();
}

/**
 * Le visuel, son alternative assainie : une URL ou un nom de fichier venu de
 * la médiathèque cède la place au nom de l'article (RGAA 1.3).
 */
export function named(image: ShopImageView, name: string): ShopImageView {
  const alt = imageAlt(image.alt, name);
  return alt === image.alt ? image : { ...image, alt };
}

/**
 * Le visuel d'un article **en rayon** : sa vignette, sinon son ouverture,
 * sinon le logo de la maison.
 *
 * 🔴 Le repli en cascade est le point. Avant le 2026-09-23, la vignette ne
 * traversait pas le fil : le rôle existait à l'écran d'administration, on
 * pouvait le choisir, et **rien ne se passait**. Depuis, une fiche qui en
 * désigne une la voit en rayon ; une fiche qui n'en désigne pas garde
 * exactement le comportement d'hier.
 *
 * ⚠️ Le repli va de la vignette VERS l'ouverture, jamais l'inverse. Une
 * ouverture 3/2 recadrée en 4/3 perd ses bords, ce qui est acceptable ; une
 * vignette cadrée serré étirée en ouverture montrerait un gros plan là où on
 * attend la pièce entière.
 */
export function tileArtOf(item: ShopItemView): ShopImageView {
  return item.thumbnail ? named(item.thumbnail, item.name) : artOf(item);
}

/**
 * Ce que le calcul lit d'une image : son point focal, et lui seul. Les visuels
 * des fiches, les images de la vitrine et celles des opérations le portent
 * tous (L10, 2026-10-11) — une seule fonction pour les trois.
 */
export interface FocusedImage {
  readonly focal?: ShopImageFocal | null | undefined;
}

/** Le centre : ce que la vitrine fait quand personne ne s'est prononcé. */
const CENTERED = '50% 50%';

/**
 * **Où recadrer un visuel** en `object-fit: cover` — la valeur de
 * `object-position`, tirée du point focal posé à la médiathèque (L4,
 * 2026-10-10).
 *
 * Le point focal est en fractions de 0 à 1 ; `object-position` en
 * pourcentages place le MÊME point de l'image sur le même point du cadre,
 * donc la pièce reste dans le champ quel que soit le ratio. Absent ou `null`
 * (illustration de rayon, envoi d'avant) : le centre, comme toujours.
 */
export function objectPositionOf(image: FocusedImage): string {
  const focal = image.focal;
  if (focal === null || focal === undefined) {
    return CENTERED;
  }
  return `${percent(focal.x)} ${percent(focal.y)}`;
}

function percent(fraction: number): string {
  return `${String(Math.round(fraction * 1000) / 10)}%`;
}
