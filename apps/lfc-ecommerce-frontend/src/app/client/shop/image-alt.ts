/**
 * **Le texte alternatif d'une image de la boutique** — produit, vitrine,
 * opération — tel qu'un lecteur d'écran doit l'entendre.
 *
 * La médiathèque replie une alternative absente sur l'URL du fichier, et un
 * téléversement peut porter son nom de fichier (constaté en production : 58
 * images sur 89 en rayon, 3 sur 4 à l'accueil — pré-audit RGAA, critère 1.3).
 * Une URL lue à voix haute n'informe personne : on la refuse ici, et l'on se
 * replie sur ce que l'écran sait nommer.
 *
 * Le repli est choisi par l'appelant :
 * - le **nom du produit** quand l'image est la seule à le montrer ;
 * - `''` (`DECORATIVE_ALT`) quand elle est décorative, ou déjà nommée par le
 *   bouton ou la carte qui l'enveloppe — l'annoncer deux fois serait du bruit.
 *
 * Sans dépendance : la Function de la page produit l'importe aussi.
 */
export function imageAlt(alt: string | null | undefined, fallback: string): string {
  return isMeaningfulAlt(alt) ? alt.trim() : fallback;
}

/** L'alternative d'une image décorative ou nommée par son contrôle. */
export const DECORATIVE_ALT = '';

/** Une extension d'image en fin de chaîne : `croissant.JPG`, `IMG_0042.heic`. */
const IMAGE_FILE = /\.(?:jpe?g|png|gif|webp|avif|svg|heic|heif|bmp|tiff?)$/i;

/** Un schéma d'URL (`https:`, `data:`, `blob:`) ou une URL sans schéma (`//cdn…`). */
const URL_LIKE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * Vrai si la chaîne décrit l'image : non vide, et ni une URL, ni un chemin,
 * ni un nom de fichier.
 */
export function isMeaningfulAlt(alt: string | null | undefined): alt is string {
  if (typeof alt !== 'string') {
    return false;
  }
  const text = alt.trim();
  if (text === '') {
    return false;
  }
  if (URL_LIKE.test(text) || IMAGE_FILE.test(text)) {
    return false;
  }
  // Un chemin (`products/abc`) : des barres obliques et aucun espace.
  return !(text.includes('/') && !/\s/.test(text));
}
