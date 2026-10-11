import {
  isMediaAltWritten,
  type LibraryMediaView,
  type MediaDetailsPayload,
} from '@lfd/pim-contracts';

import { fileNameOf } from './image-facts';
import type { ImageDescription } from './image-description';

/**
 * **Les règles du remplacement d'une image** — pures, pour qu'on les éprouve
 * sans panneau. Le panneau (`replace-panel`) ne fait qu'orchestrer les appels.
 */

/** Les deux façons de désigner la nouvelle image. */
export type ReplaceSource = 'deposit' | 'library';

export const REPLACE_SOURCES = [
  { key: 'deposit', label: 'Déposer un fichier' },
  { key: 'library', label: 'Choisir dans le fonds' },
] as const satisfies readonly { key: ReplaceSource; label: string }[];

/** La nouvelle image désignée, et ce qu'on sait de sa description. */
export interface ReplaceCandidate {
  readonly image: ImageDescription;
  /**
   * `true` / `false` : décrite ou non. `null` : déjà au fonds mais hors du fil
   * chargé — on ne sait pas, et dans le doute on n'écrase rien.
   */
  readonly described: boolean | null;
  /** Le dépôt a reconnu des octets déjà au fonds. */
  readonly alreadyInLibrary: boolean;
}

/** L'étiquette d'une image, ou son nom de fichier faute d'étiquette. */
export function imageLabel(image: { readonly name: string; readonly url: string }): string {
  return image.name !== '' ? image.name : fileNameOf(image.url);
}

/** Une image déposée à l'instant : rien n'en est encore écrit. */
export function blankImage(url: string): ImageDescription {
  return { url, name: '', alt: { fr: '' }, focal: null, tags: [], series: null };
}

/** Une image du fonds, telle que le remplacement la compare — sans ses informations. */
export function candidateImage(item: LibraryMediaView): ImageDescription {
  return {
    url: item.url,
    name: item.name,
    alt: item.alt,
    focal: item.focal,
    tags: item.tags,
    series: item.series,
  };
}

/**
 * Ce qu'on sait de la description d'une image désignée par un dépôt.
 *
 * Un fichier neuf n'a rien (`false`). Des octets déjà au fonds : décrits ou
 * non selon le fil chargé — et `null` s'ils n'y sont pas, car on ne sait pas,
 * et dans le doute on n'écrase rien.
 */
export function depositedDescribed(
  alreadyInLibrary: boolean,
  known: ImageDescription | null,
): boolean | null {
  if (!alreadyInLibrary) {
    return false;
  }
  return known === null ? null : isDescribed(known);
}

/**
 * L'image porte-t-elle une description ? L'alternative de repli EST l'URL
 * quand personne n'a écrit (le serveur le rend ainsi) : elle ne compte pas.
 */
export function isDescribed(image: ImageDescription): boolean {
  return (
    image.name.trim() !== '' ||
    image.tags.length > 0 ||
    image.focal !== null ||
    isMediaAltWritten(image.alt, image.url)
  );
}

/**
 * Le corps qui reprend la description de l'ancienne sur la nouvelle — TOUS
 * les champs, puisque l'écriture est un remplacement. `seriesId` est OMIS :
 * absent = inchangé, et la nouvelle garde sa série.
 */
export function takenOver(from: ImageDescription, to: string): MediaDetailsPayload {
  return {
    url: to,
    name: from.name,
    tags: [...from.tags],
    // Une source vide (ou le repli sur l'URL) veut dire « pas d'alternative » :
    // le contrat refuserait un texte sans sa langue, le serveur retombe sur l'URL.
    ...(isMediaAltWritten(from.alt, from.url) ? { alt: from.alt } : {}),
    focal: from.focal,
  };
}
