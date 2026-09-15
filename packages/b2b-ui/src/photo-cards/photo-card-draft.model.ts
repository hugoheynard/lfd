import type { PhotoCardFields, PhotoCardPhotoChange, PhotoCardView } from './photo-cards.gateway';

/**
 * Le brouillon d'une carte photo et ses dérivations — fonctions pures, testées
 * sans Angular. Les bornes sont en paramètre : chaque usage a les siennes, que
 * son contrat fixe.
 */

/**
 * La photo telle qu'on la voit dans le formulaire : aucune, celle déjà
 * enregistrée (reconnue à sa révision), ou une nouvelle, déjà allégée — avec
 * sa vignette quand la politique de l'usage en fabrique une.
 */
export type PhotoDraft =
  | { readonly kind: 'none' }
  | { readonly kind: 'kept'; readonly revision: string }
  | { readonly kind: 'picked'; readonly photo: Blob; readonly thumbnail?: Blob };

export interface PhotoCardDraft {
  readonly title: string;
  readonly body: string;
  readonly photo: PhotoDraft;
}

export const EMPTY_PHOTO_CARD_DRAFT: PhotoCardDraft = {
  title: '',
  body: '',
  photo: { kind: 'none' },
};

/** Les bornes d'un usage : longueurs après `trim()`, et nombre de cartes. */
export interface PhotoCardLimits {
  readonly titleMax: number;
  readonly bodyMax: number;
  readonly maxCards: number;
}

/** Ce qui empêche d'enregistrer, ou `''`. */
export type PhotoCardIssue = '' | 'title-required' | 'title-too-long' | 'body-too-long';

/** Le brouillon prérempli d'une carte qu'on refait. */
export function photoCardDraftFrom(card: PhotoCardView): PhotoCardDraft {
  return {
    title: card.title,
    body: card.body,
    photo:
      card.photoRevision === null
        ? { kind: 'none' }
        : { kind: 'kept', revision: card.photoRevision },
  };
}

/**
 * Le premier reproche du brouillon. Les longueurs se mesurent **après**
 * `trim()`, comme les contrats : des espaces de fin ne doivent pas faire
 * refuser un titre que le serveur accepterait.
 */
export function photoCardIssueOf(draft: PhotoCardDraft, limits: PhotoCardLimits): PhotoCardIssue {
  const title = draft.title.trim();
  if (title === '') {
    return 'title-required';
  }
  if (title.length > limits.titleMax) {
    return 'title-too-long';
  }
  if (draft.body.trim().length > limits.bodyMax) {
    return 'body-too-long';
  }
  return '';
}

/** Les champs texte envoyés. */
export function toPhotoCardFields(draft: PhotoCardDraft): PhotoCardFields {
  return { title: draft.title.trim(), body: draft.body.trim() };
}

/** La photo d'une carte qu'on ajoute : la nouvelle, ou aucune. */
export function newPhotoOf(draft: PhotoCardDraft): Blob | null {
  return draft.photo.kind === 'picked' ? draft.photo.photo : null;
}

/** La vignette de la photo neuve, quand l'usage en fabrique une. */
export function newThumbnailOf(draft: PhotoCardDraft): Blob | undefined {
  return draft.photo.kind === 'picked' ? draft.photo.thumbnail : undefined;
}

/**
 * Ce qu'on fait de la photo d'une carte qu'on refait, par comparaison à
 * l'ouverture : une nouvelle la remplace, l'avoir retirée la retire, sinon on
 * n'y touche pas.
 */
export function photoCardChangeOf(
  draft: PhotoCardDraft,
  initial: PhotoCardDraft,
): PhotoCardPhotoChange {
  if (draft.photo.kind === 'picked') {
    const { photo, thumbnail } = draft.photo;
    return thumbnail === undefined
      ? { kind: 'replace', photo }
      : { kind: 'replace', photo, thumbnail };
  }
  if (draft.photo.kind === 'none' && initial.photo.kind !== 'none') {
    return { kind: 'remove' };
  }
  return { kind: 'keep' };
}

/**
 * Le brouillon diffère-t-il de l'ouverture ? Enregistrer n'est cliquable qu'à
 * cette condition : rien à envoyer, rien à cliquer.
 */
export function isPhotoCardDraftChanged(draft: PhotoCardDraft, initial: PhotoCardDraft): boolean {
  return (
    draft.title.trim() !== initial.title.trim() ||
    draft.body.trim() !== initial.body.trim() ||
    draft.photo.kind === 'picked' ||
    draft.photo.kind !== initial.photo.kind
  );
}

/**
 * L'ordre obtenu en déplaçant une carte d'un rang, ou `null` si le geste sort
 * des bornes (monter la première, descendre la dernière) ou vise une carte
 * inconnue.
 */
export function movedCardIds(
  cards: readonly PhotoCardView[],
  cardId: string,
  offset: -1 | 1,
): readonly string[] | null {
  const from = cards.findIndex((card) => card.id === cardId);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= cards.length) {
    return null;
  }
  const ids = cards.map((card) => card.id);
  [ids[from], ids[to]] = [ids[to] ?? '', ids[from] ?? ''];
  return ids;
}

/** Une carte de plus tient-elle encore sous la borne ? */
export function canAddCard(count: number, limits: PhotoCardLimits): boolean {
  return count < limits.maxCards;
}
