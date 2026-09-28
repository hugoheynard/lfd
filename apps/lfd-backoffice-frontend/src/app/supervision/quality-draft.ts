import {
  QUALITY_PHOTO_MAX_BYTES,
  QUALITY_PHOTO_MAX_COUNT,
  type QualityCheckView,
  type QualityTargetPayload,
  type QualityVerdictCode,
} from '@lfd/contracts';

/**
 * **Le brouillon d'un contrôle** — ce que le panneau tient avant Enregistrer.
 * Fonctions pures : le panneau les appelle, les specs les lisent sans monter
 * de composant (`plan-controle-qualite.md`, §0, D8).
 */

/** Une photo choisie : déposée dès le choix, rattachée au verdict par son `uploadId`. */
export type DraftPhoto =
  | { readonly key: number; readonly preview: string; readonly status: 'uploading' }
  | {
      readonly key: number;
      readonly preview: string;
      readonly status: 'ready';
      readonly uploadId: string;
    }
  | {
      readonly key: number;
      readonly preview: string;
      readonly status: 'failed';
      readonly reason: string;
    };

/** La note est obligatoire dès la réserve (§0) — et une note d'espaces n'en est pas une. */
export function noteRequired(verdict: QualityVerdictCode): boolean {
  return verdict !== 'ok';
}

/**
 * **Enregistrer** n'est cliquable que si le verdict est complet et qu'aucune
 * photo n'est en route ni en échec : envoyer pendant un dépôt perdrait la photo,
 * et une photo en échec laissée là ferait croire qu'elle part.
 */
export function canRender(
  verdict: QualityVerdictCode,
  note: string,
  photos: readonly DraftPhoto[],
): boolean {
  if (noteRequired(verdict) && note.trim() === '') {
    return false;
  }
  return photos.every((photo) => photo.status === 'ready');
}

/** Les `uploadId` à rattacher, dans l'ordre où les photos ont été choisies. */
export function uploadIdsOf(photos: readonly DraftPhoto[]): string[] {
  return photos.flatMap((photo) => (photo.status === 'ready' ? [photo.uploadId] : []));
}

/** Combien de photos peuvent encore s'ajouter. */
export function roomFor(photos: readonly DraftPhoto[]): number {
  return Math.max(0, QUALITY_PHOTO_MAX_COUNT - photos.length);
}

/** Le refus posé AVANT le dépôt : le serveur le refuserait de toute façon. */
export function photoRefusal(file: {
  readonly size: number;
  readonly type: string;
}): string | null {
  if (file.type !== '' && !file.type.startsWith('image/')) {
    return 'Ce fichier n’est pas une image.';
  }
  const megabytes = QUALITY_PHOTO_MAX_BYTES / (1024 * 1024);
  return file.size > QUALITY_PHOTO_MAX_BYTES
    ? `Photo trop lourde : ${String(megabytes)} Mo au plus.`
    : null;
}

/** Les verdicts rendus sur CETTE cible, du plus récent au plus ancien (l'ordre du serveur). */
export function historyOf(
  checks: readonly QualityCheckView[],
  target: QualityTargetPayload,
): QualityCheckView[] {
  return checks.filter((check) =>
    target.kind === 'line'
      ? check.target.kind === 'line' && check.target.sku === target.sku
      : check.target.kind === 'order' && check.target.orderId === target.orderId,
  );
}
