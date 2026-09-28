import type { FoldBadgeVariant } from 'fold-ng';
import {
  QUALITY_PHOTO_MAX_BYTES,
  QUALITY_PHOTO_MAX_COUNT,
  type QualityCheckView,
  type QualityTargetPayload,
  type QualityVerdictCode,
} from '@lfd/contracts';

import type { QualityBadge } from './quality-badges';
import { clockLabel } from './supervision-labels';

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
export function noteRequired(verdict: QualityVerdictCode | null): boolean {
  return verdict !== null && verdict !== 'ok';
}

/**
 * **Enregistrer** n'est cliquable que si le verdict est complet et qu'aucune
 * photo n'est en route ni en échec : envoyer pendant un dépôt perdrait la photo,
 * et une photo en échec laissée là ferait croire qu'elle part.
 */
export function canRender(
  verdict: QualityVerdictCode | null,
  note: string,
  photos: readonly DraftPhoto[],
): boolean {
  if (blockReason(verdict, note) !== null) {
    return false;
  }
  return photos.every((photo) => photo.status === 'ready');
}

/**
 * Pourquoi Enregistrer reste inactif, dit au pied du panneau — `null` quand
 * le verdict est complet. Aucun verdict n'est choisi d'avance : un OK
 * présélectionné s'enregistre d'un clic distrait.
 */
export function blockReason(verdict: QualityVerdictCode | null, note: string): string | null {
  if (verdict === null) {
    return 'Choisissez un verdict.';
  }
  return noteRequired(verdict) && note.trim() === '' ? 'Une note est nécessaire.' : null;
}

/** Le bouton principal dit ce qu'il fait : on n'« enregistre » pas un blocage. */
export function saveLabel(verdict: QualityVerdictCode | null): string {
  if (verdict === 'blocking') {
    return 'Bloquer';
  }
  return verdict === 'warning' ? 'Enregistrer la réserve' : 'Enregistrer';
}

/** Ce que chaque verdict entraîne, sous son nom *(à valider)*. */
export const VERDICT_CONSEQUENCES: Readonly<Record<QualityVerdictCode, string>> = {
  ok: 'Rien à redire.',
  warning: 'On le note, ça part.',
  blocking: 'Ça ne part pas.',
};

/** Les étiquettes rapides de la note *(proposées)*. */
export const NOTE_TAGS: readonly string[] = [
  'Cuisson',
  'Aspect',
  'Quantité',
  'Emballage',
  'Température',
];

/**
 * Une étiquette préremplit la note : seule, elle ouvre la phrase
 * (« Cuisson : ») ; sinon elle s'ajoute, une fois.
 */
export function withTag(note: string, tag: string): string {
  const trimmed = note.trim();
  if (trimmed === '') {
    return `${tag} : `;
  }
  return note.includes(tag) ? note : `${trimmed} · ${tag}`;
}

/**
 * Qui un blocage touche. Une ligne : les commandes qui l'attendent, puis
 * toutes celles du jour qui la contiennent ; une commande : son retrait.
 */
export function blockingImpact(
  target: QualityTargetPayload,
  title: string,
  awaitedBy: readonly string[],
): string {
  if (target.kind === 'order') {
    return `${title} ne pourra pas être remise : le scan du QR la refusera.`;
  }
  return awaitedBy.length > 0
    ? `Commandes concernées : ${awaitedBy.join(', ')}, et toute commande du jour qui contient ${title}.`
    : `Toute commande du jour qui contient ${title}.`;
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

/** Le rond de chaque carte de verdict. */
export const VERDICT_GLYPHS: Readonly<Record<QualityVerdictCode, string>> = {
  ok: '✓',
  warning: '!',
  blocking: '✕',
};

/**
 * La pastille de l'en-tête : celle de la cible, reprise en « Actuel · … ».
 * `null` : jamais contrôlée. `undefined` : la page ne l'a pas passée — rien
 * à dire, plutôt qu'un « Jamais contrôlé » inventé.
 */
export function currentBadge(
  current: QualityBadge | null | undefined,
): { readonly label: string; readonly variant: FoldBadgeVariant } | undefined {
  if (current === undefined) {
    return undefined;
  }
  return current === null
    ? { label: 'Jamais contrôlé', variant: 'neutral' }
    : { label: current.label.replace('Contrôle · ', 'Actuel · '), variant: current.variant };
}

/**
 * « Léa Martin · 7 h 12 · sur 96 pièces », suivi de « · périmé : … » quand la
 * pastille de la cible dit que ce verdict ne vaut plus.
 */
export function bylineOf(check: QualityCheckView, staleDetail: string | null): string {
  const who = check.checkedByName ?? check.checkedBy;
  const at = clockLabel(check.checkedAt);
  const seen =
    check.target.kind === 'line' ? ` · sur ${String(check.target.quantitySeen)} pièces` : '';
  const stale = staleDetail === null ? '' : ` · périmé : ${staleDetail}`;
  return `${who}${at === null ? '' : ` · ${at}`}${seen}${stale}`;
}
