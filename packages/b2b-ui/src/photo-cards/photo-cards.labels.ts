import type { PhotoCardView } from './photo-cards.gateway';

/**
 * Les libellés du formulaire d'une carte (`lfd-photo-card-form`).
 *
 * Aucun défaut ici : ce que dit « le titre », « la photo » dépend de l'usage
 * (une étape, une note), et les bornes citées aussi. Chaque usage fournit les siens.
 */
export interface PhotoCardFormLabels {
  readonly title: string;
  readonly titleHint: string;
  readonly body: string;
  readonly bodyHint: string;
  readonly optional: string;
  readonly photoLegend: string;
  readonly photoHint: string;
  readonly choosePhoto: string;
  readonly replacePhoto: string;
  readonly removePhoto: string;
  readonly photoPreviewAlt: string;
  readonly photoReducing: string;
  readonly photoTooHeavy: string;
  readonly photoUnreadable: string;
  readonly titleRequired: string;
  readonly titleTooLong: string;
  readonly bodyTooLong: string;
}

/**
 * Les libellés de `lfd-photo-cards-editor`, formulaire compris.
 *
 * Ce qui porte une carte est une fonction de la carte : le sous-titre peut être
 * un rang servi par le serveur, un auteur ou une date — l'éditeur n'en sait rien.
 */
export interface PhotoCardsEditorLabels<C extends PhotoCardView = PhotoCardView> {
  readonly loading: string;
  readonly loadError: string;
  readonly retry: string;
  readonly emptyTitle: string;
  readonly emptySubtitleEditable: string;
  readonly emptySubtitleReadOnly: string;
  /** Le bouton qui ouvre le formulaire d'ajout. */
  readonly addCard: string;
  readonly limitReached: string;
  readonly cardSubtitle: (card: C) => string;
  readonly moveUp: string;
  readonly moveDown: string;
  readonly revise: string;
  readonly photoAlt: (card: C) => string;
  readonly conflict: string;
  readonly writeFailed: string;
  readonly newHeading: string;
  readonly reviseHeading: (card: C) => string;
  readonly save: string;
  /** Le bouton qui envoie une carte neuve. */
  readonly submitNew: string;
  readonly cancel: string;
  readonly removeTitle: string;
  readonly removeAction: string;
  readonly removeExplanation: string;
  readonly removeConfirm: string;
}

/**
 * Les libellés de la **vue en grand** (`lfd-photo-card-viewer`) et du geste
 * qui l'ouvre. Seul un usage à vignettes en a besoin : la liste n'y montre
 * qu'une réduction, et la photo lisible ne s'ouvre qu'ici.
 */
export interface PhotoCardViewerLabels {
  /** Le nom accessible de la vignette cliquable, à partir du titre de la carte. */
  readonly enlarge: (title: string) => string;
  readonly photoAlt: (title: string) => string;
  readonly loading: string;
  readonly loadError: string;
  readonly retry: string;
  /** Passer de l'image ajustée à sa taille réelle. */
  readonly actualSize: string;
  /** Revenir à l'image ajustée. */
  readonly fitToScreen: string;
  readonly close: string;
}
