import {
  DELIVERY_PROCEDURE_MAX_STEPS,
  DELIVERY_STEP_BODY_MAX,
  DELIVERY_STEP_TITLE_MAX,
  type DeliveryProcedureStepView,
} from '@lfd/contracts';

import type {
  PhotoCardFormLabels,
  PhotoCardsEditorLabels,
} from '../../photo-cards/photo-cards.labels';

/**
 * Les libellés du formulaire d'une étape (`lfd-delivery-step-form`) : ceux du
 * formulaire photo-cartes, sous le nom que la procédure a publié.
 *
 * Pur, sans Angular : le runner du paquet (Jest, Node) les lit.
 */
export type DeliveryStepFormLabels = PhotoCardFormLabels;

/**
 * Les libellés de `lfd-delivery-procedure-editor`, formulaire compris.
 *
 * Le défaut est en français : l'admin ne passe rien, la plateforme passe les
 * siens (fr/en/it). Les textes qui portent un nombre sont des fonctions — une
 * phrase à trou ne se traduit pas en recollant des morceaux.
 */
export interface DeliveryProcedureEditorLabels {
  readonly loading: string;
  readonly loadError: string;
  readonly retry: string;
  readonly emptyTitle: string;
  readonly emptySubtitleEditable: string;
  readonly emptySubtitleReadOnly: string;
  readonly addStep: string;
  readonly limitReached: string;
  readonly stepNumber: (n: number) => string;
  readonly moveUp: string;
  readonly moveDown: string;
  readonly revise: string;
  readonly photoAlt: (title: string) => string;
  readonly conflict: string;
  readonly writeFailed: string;
  readonly newStepHeading: string;
  readonly reviseHeading: (n: number) => string;
  readonly save: string;
  readonly add: string;
  readonly cancel: string;
  readonly removeTitle: string;
  readonly removeAction: string;
  readonly removeExplanation: string;
  readonly removeConfirm: string;
  readonly form: DeliveryStepFormLabels;
}

export const DELIVERY_STEP_FORM_LABELS_FR: DeliveryStepFormLabels = {
  title: 'Titre',
  titleHint: `${DELIVERY_STEP_TITLE_MAX} caractères au plus — ce qu'on lit d'un coup d'œil.`,
  body: 'Texte',
  bodyHint: `${DELIVERY_STEP_BODY_MAX} caractères au plus.`,
  optional: 'optionnel',
  photoLegend: 'Photo',
  photoHint: 'Une photo de la porte, du portail ou du passage. Elle est allégée avant l’envoi.',
  choosePhoto: 'Choisir une photo',
  replacePhoto: 'Remplacer la photo',
  removePhoto: 'Retirer la photo',
  photoPreviewAlt: 'Aperçu de la photo de l’étape',
  photoReducing: 'Allègement de la photo…',
  photoTooHeavy:
    'Cette photo reste trop lourde, même allégée. Choisissez-en une autre, ou recadrez-la.',
  photoUnreadable: 'Ce fichier n’est pas une image lisible. Choisissez une photo JPEG ou PNG.',
  titleRequired: 'Le titre est requis.',
  titleTooLong: `Le titre dépasse ${DELIVERY_STEP_TITLE_MAX} caractères.`,
  bodyTooLong: `Le texte dépasse ${DELIVERY_STEP_BODY_MAX} caractères.`,
};

export const DELIVERY_PROCEDURE_EDITOR_LABELS_FR: DeliveryProcedureEditorLabels = {
  loading: 'Chargement de la procédure…',
  loadError: 'La procédure de livraison n’a pas pu être chargée.',
  retry: 'Réessayer',
  emptyTitle: 'Aucune procédure de livraison',
  emptySubtitleEditable:
    'Décrivez, étape par étape, comment le livreur dépose la marchandise à cette adresse.',
  emptySubtitleReadOnly: 'Aucune étape n’a été décrite pour cette adresse.',
  addStep: 'Ajouter une étape',
  limitReached: `Une procédure compte au plus ${DELIVERY_PROCEDURE_MAX_STEPS} étapes.`,
  stepNumber: (n) => `Étape ${n}`,
  moveUp: 'Monter l’étape',
  moveDown: 'Descendre l’étape',
  revise: 'Refaire',
  photoAlt: (title) => `Photo de l’étape « ${title} »`,
  conflict: 'La procédure a changé entre-temps : elle vient d’être rechargée.',
  writeFailed: 'L’enregistrement a échoué. Réessayez.',
  newStepHeading: 'Nouvelle étape',
  reviseHeading: (n) => `Refaire l’étape ${n}`,
  save: 'Enregistrer',
  add: 'Ajouter l’étape',
  cancel: 'Annuler',
  removeTitle: 'Supprimer cette étape',
  removeAction: 'Supprimer l’étape',
  removeExplanation:
    'L’étape est supprimée définitivement, photo comprise. Les suivantes remontent d’un rang.',
  removeConfirm: 'Supprimer définitivement cette étape ?',
  form: DELIVERY_STEP_FORM_LABELS_FR,
};

/**
 * Les libellés de la procédure, dits dans la langue de l'éditeur photo-cartes.
 *
 * La procédure a publié ses noms (`addStep`, `stepNumber`…) avant le socle, et
 * les copies fr/en/it de la plateforme les portent : on traduit ici plutôt que
 * de les renommer. Le sous-titre est le `number` servi, pas le rang.
 */
export function photoCardsLabelsOf(
  labels: DeliveryProcedureEditorLabels,
): PhotoCardsEditorLabels<DeliveryProcedureStepView> {
  return {
    loading: labels.loading,
    loadError: labels.loadError,
    retry: labels.retry,
    emptyTitle: labels.emptyTitle,
    emptySubtitleEditable: labels.emptySubtitleEditable,
    emptySubtitleReadOnly: labels.emptySubtitleReadOnly,
    addCard: labels.addStep,
    limitReached: labels.limitReached,
    cardSubtitle: (step) => labels.stepNumber(step.number),
    moveUp: labels.moveUp,
    moveDown: labels.moveDown,
    revise: labels.revise,
    photoAlt: (step) => labels.photoAlt(step.title),
    conflict: labels.conflict,
    writeFailed: labels.writeFailed,
    newHeading: labels.newStepHeading,
    reviseHeading: (step) => labels.reviseHeading(step.number),
    save: labels.save,
    submitNew: labels.add,
    cancel: labels.cancel,
    removeTitle: labels.removeTitle,
    removeAction: labels.removeAction,
    removeExplanation: labels.removeExplanation,
    removeConfirm: labels.removeConfirm,
  };
}
