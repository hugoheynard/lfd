import { SOURCE_LOCALE, type Locale } from "./shared.js";

/**
 * **Une image dont personne n'a écrit l'alternative n'a PAS d'alternative** —
 * la règle, écrite une fois et lue des deux côtés.
 *
 * Jusqu'au 2026-10-26, l'absence se repliait sur l'URL du fichier, « pour se
 * voir ». Elle s'est surtout entendue : le pré-audit RGAA de la boutique a
 * relevé 58 images sur 89 dont le lecteur d'écran lisait l'URL. Une
 * alternative absente se range désormais en langue source VIDE, et une URL,
 * un chemin ou un nom de fichier ne passent pas pour une description — la
 * même règle que `image-alt.ts` de la boutique.
 */

/** Ce qu'un écran envoie : la source peut manquer, ou être laissée vide. */
export type DraftAlt = Readonly<Partial<Record<Locale, string>>>;

/** Une extension d'image en fin de chaîne : `croissant.JPG`, `IMG_0042.heic`. */
const IMAGE_FILE = /\.(?:jpe?g|png|gif|webp|avif|svg|heic|heif|bmp|tiff?)$/i;

/** Un schéma d'URL (`https:`, `data:`, `blob:`) ou une URL sans schéma (`//cdn…`). */
const URL_LIKE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * Ce texte DÉCRIT-il une image ? — non blanc, et ni une URL, ni un chemin
 * (`products/abc` : des barres obliques et aucun espace), ni un nom de fichier.
 */
export function isDescriptiveAltText(text: string | null | undefined): text is string {
  const value = text?.trim() ?? "";
  if (value === "" || URL_LIKE.test(value) || IMAGE_FILE.test(value)) {
    return false;
  }
  return !(value.includes("/") && !/\s/.test(value));
}

/**
 * L'alternative de cette image est-elle RÉDIGÉE ? — une langue source qui
 * décrit l'image (ni vide, ni URL, ni nom de fichier).
 *
 * Le second paramètre est gardé pour les appelants : l'URL de l'image elle-même
 * est un cas particulier d'URL, déjà refusé par la règle générale.
 */
export function isMediaAltWritten(alt: DraftAlt | null | undefined, url: string): boolean {
  const source = alt?.[SOURCE_LOCALE];
  return isDescriptiveAltText(source) && source.trim() !== url;
}
