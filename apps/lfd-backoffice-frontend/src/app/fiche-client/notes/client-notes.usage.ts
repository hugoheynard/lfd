import {
  CLIENT_NOTE_BODY_MAX,
  CLIENT_NOTE_PHOTO_LONG_EDGE,
  CLIENT_NOTE_PHOTO_MAX_BYTES,
  CLIENT_NOTE_THUMBNAIL_LONG_EDGE,
  CLIENT_NOTE_THUMBNAIL_MAX_BYTES,
  CLIENT_NOTE_TITLE_MAX,
  CLIENT_NOTEBOOK_MAX_NOTES,
  type ClientNoteView,
} from '@lfd/contracts';
import type {
  PhotoCardFormLabels,
  PhotoCardLimits,
  PhotoCardPhotoDisplay,
  PhotoReductionPolicy,
  PhotoCardsEditorLabels,
} from '@lfd/b2b-ui/photo-cards';

/**
 * Ce qui fait des cartes photo du socle les **notes du commercial** : leurs
 * bornes, leur politique de photo et leurs mots. Tout vient du contrat, rien
 * n'est recopié (plan « notes photo du commercial », D2, D7 bis).
 */

export const CLIENT_NOTE_LIMITS: PhotoCardLimits = {
  titleMax: CLIENT_NOTE_TITLE_MAX,
  bodyMax: CLIENT_NOTE_BODY_MAX,
  maxCards: CLIENT_NOTEBOOK_MAX_NOTES,
};

/**
 * La photo lisible en passes décroissantes (0,75 puis 0,6 puis 0,5, plan D7 bis),
 * et la vignette fabriquée au même envoi.
 *
 * Les passes de la vignette ne sont pas fixées par le plan : 0,7 puis 0,5
 * suffisent à 320 px, où une page écrite pèse quelques dizaines de Ko.
 */
export const CLIENT_NOTE_PHOTO_POLICY: PhotoReductionPolicy = {
  longEdge: CLIENT_NOTE_PHOTO_LONG_EDGE,
  qualities: [0.75, 0.6, 0.5],
  maxBytes: CLIENT_NOTE_PHOTO_MAX_BYTES,
  thumbnail: {
    longEdge: CLIENT_NOTE_THUMBNAIL_LONG_EDGE,
    qualities: [0.7, 0.5],
    maxBytes: CLIENT_NOTE_THUMBNAIL_MAX_BYTES,
  },
};

const KILOBYTE = 1024;

export const CLIENT_NOTE_FORM_LABELS: PhotoCardFormLabels = {
  title: 'Titre',
  titleHint: `${CLIENT_NOTE_TITLE_MAX} caractères au plus — ce qu'on lit d'un coup d'œil.`,
  body: 'Description',
  bodyHint: `${CLIENT_NOTE_BODY_MAX} caractères au plus.`,
  optional: 'optionnel',
  photoLegend: 'Photo de la note',
  // Pas de `capture` sur le champ (plan D10) : le téléphone propose l'appareil
  // ET la galerie, et une note photographiée plus tôt doit pouvoir se choisir.
  photoHint:
    'Prenez la note papier en photo, ou choisissez-la dans la galerie. Elle est allégée avant l’envoi.',
  choosePhoto: 'Choisir une photo',
  replacePhoto: 'Remplacer la photo',
  removePhoto: 'Retirer la photo',
  photoPreviewAlt: 'Aperçu de la photo de la note',
  photoReducing: 'Allègement de la photo…',
  photoTooHeavy: `Cette photo reste trop lourde, même allégée (${CLIENT_NOTE_PHOTO_MAX_BYTES / KILOBYTE} Ko au plus). Recadrez-la sur la note, ou reprenez-la de plus près.`,
  photoUnreadable: 'Ce fichier n’est pas une image lisible. Choisissez une photo JPEG ou PNG.',
  titleRequired: 'Le titre est requis.',
  titleTooLong: `Le titre dépasse ${CLIENT_NOTE_TITLE_MAX} caractères.`,
  bodyTooLong: `La description dépasse ${CLIENT_NOTE_BODY_MAX} caractères.`,
};

/**
 * « 15 septembre 2026 », à l'heure de Paris : c'est là que la note est déposée,
 * et un écran ouvert ailleurs ne doit pas la faire changer de jour.
 */
const DEPOSIT_DATE = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeZone: 'Europe/Paris',
});

/** « Déposée le 15 septembre 2026 par Camille ». La date de la note papier n'est pas saisie (D2). */
export function clientNoteSubtitle(note: ClientNoteView): string {
  const at = new Date(note.createdAt);
  const when = Number.isNaN(at.getTime()) ? '' : ` le ${DEPOSIT_DATE.format(at)}`;
  const who = note.createdByName.trim() === '' ? '' : ` par ${note.createdByName}`;
  return `Déposée${when}${who}`;
}

export const CLIENT_NOTES_EDITOR_LABELS: PhotoCardsEditorLabels<ClientNoteView> = {
  loading: 'Chargement des notes…',
  loadError: 'Les notes de ce client n’ont pas pu être chargées.',
  retry: 'Réessayer',
  emptyTitle: 'Aucune note',
  emptySubtitleEditable:
    'Photographiez vos notes papier sur ce client : titre, description et photo, classées à la main.',
  emptySubtitleReadOnly: 'Aucune note n’a été déposée sur ce client.',
  addCard: 'Ajouter une note',
  limitReached: `Un client compte au plus ${CLIENT_NOTEBOOK_MAX_NOTES} notes. Supprimez-en une pour en ajouter une autre.`,
  cardSubtitle: clientNoteSubtitle,
  moveUp: 'Monter la note',
  moveDown: 'Descendre la note',
  revise: 'Refaire',
  photoAlt: (note) => `Photo de la note « ${note.title} »`,
  conflict: 'Les notes ont changé entre-temps : elles viennent d’être rechargées.',
  writeFailed: 'L’enregistrement a échoué. Réessayez.',
  newHeading: 'Nouvelle note',
  reviseHeading: (note) => `Refaire la note « ${note.title} »`,
  save: 'Enregistrer',
  submitNew: 'Ajouter la note',
  cancel: 'Annuler',
  removeTitle: 'Supprimer cette note',
  removeAction: 'Supprimer la note',
  removeExplanation:
    'La note est supprimée définitivement, photo comprise : elle ne pourra pas être retrouvée.',
  removeConfirm: 'Supprimer définitivement cette note ?',
};

/** La liste ne montre que les vignettes ; un clic ouvre la photo lisible en grand. */
export const CLIENT_NOTES_PHOTO_DISPLAY: PhotoCardPhotoDisplay = {
  kind: 'thumbnail',
  labels: {
    enlarge: (title) => `Agrandir la photo de la note « ${title} »`,
    photoAlt: (title) => `Photo de la note « ${title} »`,
    loading: 'Chargement de la photo…',
    loadError: 'La photo n’a pas pu être chargée.',
    retry: 'Réessayer',
    actualSize: 'Taille réelle',
    fitToScreen: 'Ajuster à l’écran',
    close: 'Fermer',
  },
};
