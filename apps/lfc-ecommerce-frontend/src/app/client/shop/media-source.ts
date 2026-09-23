/**
 * **Demander une image à la taille où on l'affiche.**
 *
 * 🔴 Jusqu'au 2026-09-23, la vitrine posait l'URL du master dans la balise.
 * Mesuré sur la photo de production : **3,64 Mo servis dans une tuile de
 * 180 px**. Le navigateur téléchargeait tout, puis réduisait.
 *
 * Le redimensionnement se fait désormais à la LECTURE, par le serveur d'images
 * de la zone. Rien n'est stocké de plus : les dérivées vivent dans son cache,
 * partagé par tous les visiteurs, et le seul fichier que nous gardons reste le
 * master.
 *
 * Mesuré le jour de la bascule, sur la même photo :
 *
 * | Ce que le navigateur accepte | Ce qu'il reçoit à 720 px |
 * | ---------------------------- | ------------------------ |
 * | AVIF                         | AVIF, **21,5 ko**        |
 * | WebP seulement               | WebP, 29,2 ko            |
 * | rien de moderne              | JPEG, 31,7 ko            |
 *
 * ⚠️ **`format=auto` plutôt qu'un format choisi.** Dans l'URL, `auto` et `webp`
 * coûtent le même effort et le même stockage — c'est-à-dire aucun. Écrire
 * `webp` se priverait de 20 à 30 % d'octets sans rien simplifier : le serveur
 * d'images lit ce que le navigateur déclare accepter, et personne ne reçoit un
 * format qu'il ne sait pas lire.
 */

/**
 * Les largeurs d'une tuile de rayon : ce qu'elle mesure, et son double.
 *
 * Le double est pour les écrans à forte densité, qui affichent deux pixels
 * physiques par pixel de mise en page. **Au-delà de 2×, chaque pixel est
 * invisible et payé** — c'est toute la règle.
 */
export const TILE_WIDTHS = [360, 720] as const;

/** Les mêmes, pour l'ouverture d'une fiche, qui occupe toute la largeur. */
export const SHEET_WIDTHS = [900, 1800] as const;

/**
 * Cette URL peut-elle être redimensionnée ?
 *
 * 🔴 Trois refus, et aucun n'est décoratif :
 *
 * - **un chemin RELATIF** est une ressource de l'application, pas du fonds —
 *   l'illustration de secours d'un rayon (`products/croissant.svg`) en est
 *   une, et la faire passer par un serveur d'images la casserait ;
 * - **un SVG** n'a pas de pixels à réduire. Le redimensionner ne gagne rien et
 *   peut le rasteriser, donc le dégrader ;
 * - **`localhost`** n'est derrière aucun serveur d'images. En développement le
 *   fonds est servi par un bac à sable local ; réécrire y produirait des 404,
 *   et on passerait la journée à chercher un défaut qui n'existe qu'en dev.
 */
function resizable(url: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Relative : une ressource de l'application. `new URL` lève, et c'est le
    // test le plus simple — pas de préfixe à tenir à jour.
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }
  if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
    return null;
  }
  return parsed.pathname.toLowerCase().endsWith('.svg') ? null : parsed;
}

/**
 * L'URL de la même image, à la largeur demandée.
 *
 * Rend l'URL **inchangée** quand elle n'est pas redimensionnable : le repli
 * n'est pas une erreur, c'est le cas normal d'une illustration locale.
 *
 * ⚠️ Le chemin est relatif à l'origine de l'image (`/cdn-cgi/image/…/chemin`)
 * et non absolu : le serveur d'images d'une zone sert les ressources de cette
 * zone, et répéter l'origine dans le chemin ne sert qu'à l'allonger.
 */
export function sizedMedia(url: string, width: number): string {
  const parsed = resizable(url);
  if (parsed === null) {
    return url;
  }
  return `${parsed.origin}/cdn-cgi/image/width=${String(width)},format=auto,fit=scale-down${parsed.pathname}`;
}

/**
 * Le jeu de largeurs, tel qu'une balise l'annonce.
 *
 * Le navigateur y choisit selon la densité de son écran et la place réelle que
 * le CSS donne à l'image — c'est lui qui sait, pas nous.
 *
 * Rend une chaîne **vide** pour ce qui n'est pas redimensionnable : un
 * `srcset` qui annoncerait plusieurs largeurs du même fichier ferait croire à
 * un choix qui n'existe pas.
 */
export function mediaSrcset(url: string, widths: readonly number[]): string {
  if (resizable(url) === null) {
    return '';
  }
  return widths.map((width) => `${sizedMedia(url, width)} ${String(width)}w`).join(', ');
}
