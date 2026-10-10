import type { FocalPoint } from '@lfd/pim-contracts';

/**
 * Les mises en forme de ce qu'on SAIT d'une image — lues dans le panneau qui
 * la décrit, et pures pour qu'on les éprouve sans écran.
 *
 * Chacune rend `null` quand la donnée manque : `null` veut dire « pas
 * mesuré » au contrat (`MediaFactsView`), et un « 0 px » ou un « 0 Ko » le
 * ferait lire comme une mesure.
 */

/** La longueur conseillée d'un texte alternatif : au-delà, les lecteurs d'écran le tronquent souvent. */
export const ALT_RECOMMENDED_LENGTH = 125;

const KIB = 1024;
const MIB = KIB * KIB;

const ONE_DECIMAL = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** L'heure de PARIS, pas celle du navigateur : c'est le fuseau de la boulangerie. */
const PARIS_MOMENT = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** « 4808 × 3205 px ». */
export function formatDimensions(width: number | null, height: number | null): string | null {
  if (width === null || height === null) {
    return null;
  }
  return `${String(width)} × ${String(height)} px`;
}

/** Ko sous le méga, Mo au-dessus, une décimale. */
export function formatBytes(bytes: number | null): string | null {
  if (bytes === null) {
    return null;
  }
  return bytes < MIB
    ? `${ONE_DECIMAL.format(bytes / KIB)} Ko`
    : `${ONE_DECIMAL.format(bytes / MIB)} Mo`;
}

/** `image/jpeg` → « JPEG » ; un type sans sous-type se rend tel quel. */
export function formatContentType(contentType: string | null): string | null {
  if (contentType === null || contentType === '') {
    return null;
  }
  const subtype = contentType.split('/')[1] ?? contentType;
  return subtype.replace(/\+.*$/, '').toUpperCase();
}

export function formatParisMoment(iso: string): string {
  return PARIS_MOMENT.format(new Date(iso));
}

/**
 * Le dernier segment de l'adresse — le nom sous lequel le stockage sert le
 * fichier. Le nom envoyé par le navigateur au dépôt n'est pas conservé : c'est
 * le seul nom de fichier que l'image ait.
 */
export function fileNameOf(url: string): string {
  const path = url.split(/[?#]/)[0] ?? url;
  return path.slice(path.lastIndexOf('/') + 1) || url;
}

/** « Inutilisée », « 1 emploi », « 3 emplois ». */
export function usesWording(uses: number): string {
  if (uses === 0) {
    return 'Inutilisée';
  }
  return uses === 1 ? '1 emploi' : `${String(uses)} emplois`;
}

/**
 * L'`object-position` d'un recadrage `cover` qui garde le point en vue.
 *
 * Sans point, le centre : c'est ce que fait la boutique, qui recadre au centre
 * tant que personne ne s'est prononcé.
 */
export function objectPositionOf(focal: FocalPoint | null): string {
  if (focal === null) {
    return '50% 50%';
  }
  return `${String(round(focal.x * 100))}% ${String(round(focal.y * 100))}%`;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
