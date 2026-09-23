import type { ShopImageView, ShopItemView } from '@lfd/contracts';

/**
 * **Ce que la vitrine ajoute au catalogue**, et que le référentiel ne dit pas
 * encore.
 *
 * ⚠️ Contenu de MAISON, pas donnée de démonstration. Ce fichier ne remplace
 * aucun fait du serveur : les noms, les prix, les taux, les rayons, la ligne de
 * vitrine et le packshot arrivent tous du catalogue hydraté. Ce qui reste ici,
 * ce sont deux choses que le référentiel ne porte pas encore — l'heure de
 * fournée d'un rayon, et l'illustration de secours d'une pièce sans photo.
 *
 * Elles partiront le jour où le référentiel les portera : les heures de fournée
 * sont un fait de production, l'illustration une photo qui manque.
 */

/** Le repli quand une fiche n'a pas de photo — une pièce dessinée, jamais un vide. */
const FALLBACK_ART = 'boule';

/**
 * L'illustration de secours d'un rayon.
 *
 * Une pièce représentative par famille, dessinée. Elle ne s'affiche que si le
 * référentiel n'a pas de photo : dès qu'il en a une, c'est elle qu'on voit.
 */
const SHELF_ART: Readonly<Record<string, string>> = {
  cat_vien: 'croissant',
  cat_pains: 'baguette',
  cat_patis: 'eclair',
  cat_sale: 'quiche',
  cat_choco: 'boite-choco',
};

/**
 * L'heure à laquelle un rayon sort du four.
 *
 * Un fait de PRODUCTION que le référentiel ne porte pas : il sait ce qu'on
 * vend, pas à quelle heure ça sort. Écrit ici en attendant, et lisiblement —
 * une valeur inventée qui se ferait passer pour une donnée serveur serait pire
 * que ce fichier.
 */
const OVEN_HOURS: Readonly<Record<string, string>> = {
  cat_vien: 'entre 6 h et 7 h',
  cat_pains: 'toute la matinée',
  cat_patis: 'en fin de matinée',
  cat_sale: 'avant 11 h',
  cat_choco: 'à la demande',
};

export function ovenHoursOf(shelfId: string): string {
  return OVEN_HOURS[shelfId] ?? 'toute la matinée';
}

/** La vignette d'un rayon — pour la bannière et la feuille « En savoir plus ». */
export function shelfArtOf(shelfId: string): string {
  return `products/${SHELF_ART[shelfId] ?? FALLBACK_ART}.svg`;
}

/**
 * Le visuel d'un article **en ouverture de fiche** : celui du référentiel,
 * sinon l'illustration de son rayon.
 *
 * Le repli est nommé et non silencieux : une vitrine sans photo doit montrer
 * une pièce dessinée plutôt qu'un cadre vide, et l'alternative doit dire ce
 * qu'on voit — pas mentir sur une photo qui n'existe pas.
 */
export function artOf(item: ShopItemView): ShopImageView {
  return item.image ?? { url: shelfArtOf(item.shelfId), alt: item.name, width: null, height: null };
}

/**
 * Le visuel d'un article **en rayon** : sa vignette, sinon son ouverture,
 * sinon l'illustration de son rayon.
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
  return item.thumbnail ?? artOf(item);
}
