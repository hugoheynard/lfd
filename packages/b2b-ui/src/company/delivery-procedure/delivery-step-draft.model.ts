import {
  DELIVERY_PROCEDURE_MAX_STEPS,
  DELIVERY_STEP_BODY_MAX,
  DELIVERY_STEP_TITLE_MAX,
  type DeliveryProcedureStepView,
  type DeliveryStepFields,
} from '@lfd/contracts';

import {
  canAddCard,
  EMPTY_PHOTO_CARD_DRAFT,
  isPhotoCardDraftChanged,
  movedCardIds,
  newPhotoOf,
  photoCardChangeOf,
  photoCardDraftFrom,
  photoCardIssueOf,
  toPhotoCardFields,
  type PhotoCardDraft,
  type PhotoCardIssue,
  type PhotoCardLimits,
  type PhotoDraft,
} from '../../photo-cards/photo-card-draft.model';
import type { DeliveryStepPhotoChange } from './delivery-procedure.gateway';

/**
 * Le brouillon d'une étape : le brouillon du socle photo-cartes, **aux bornes
 * de la procédure**. Ce module ne décide rien — il lie la règle commune aux
 * nombres du contrat, et sa spec prouve que la liaison est la bonne.
 */

export type StepPhotoDraft = PhotoDraft;

export type DeliveryStepDraft = PhotoCardDraft;

export const EMPTY_DELIVERY_STEP_DRAFT: DeliveryStepDraft = EMPTY_PHOTO_CARD_DRAFT;

/** Ce qui empêche d'enregistrer, ou `''`. */
export type DeliveryStepIssue = PhotoCardIssue;

/** Les bornes d'une procédure, celles du contrat : 80 / 1000 caractères, 20 étapes. */
export const DELIVERY_STEP_LIMITS: PhotoCardLimits = {
  titleMax: DELIVERY_STEP_TITLE_MAX,
  bodyMax: DELIVERY_STEP_BODY_MAX,
  maxCards: DELIVERY_PROCEDURE_MAX_STEPS,
};

/** Le brouillon prérempli d'une étape qu'on refait. */
export function stepDraftFrom(step: DeliveryProcedureStepView): DeliveryStepDraft {
  return photoCardDraftFrom(step);
}

/** Le premier reproche du brouillon, longueurs mesurées après `trim()`. */
export function stepIssueOf(draft: DeliveryStepDraft): DeliveryStepIssue {
  return photoCardIssueOf(draft, DELIVERY_STEP_LIMITS);
}

/** Les champs texte envoyés. */
export function toStepFields(draft: DeliveryStepDraft): DeliveryStepFields {
  return toPhotoCardFields(draft);
}

/** La photo d'une étape qu'on ajoute : la nouvelle, ou aucune. */
export function newStepPhotoOf(draft: DeliveryStepDraft): Blob | null {
  return newPhotoOf(draft);
}

/** Ce qu'on fait de la photo d'une étape qu'on refait, par comparaison à l'ouverture. */
export function photoChangeOf(
  draft: DeliveryStepDraft,
  initial: DeliveryStepDraft,
): DeliveryStepPhotoChange {
  return photoCardChangeOf(draft, initial);
}

/** Le brouillon diffère-t-il de l'ouverture ? */
export function isStepDraftChanged(draft: DeliveryStepDraft, initial: DeliveryStepDraft): boolean {
  return isPhotoCardDraftChanged(draft, initial);
}

/** L'ordre obtenu en déplaçant une étape d'un rang, ou `null` hors des bornes. */
export function movedStepIds(
  steps: readonly DeliveryProcedureStepView[],
  stepId: string,
  offset: -1 | 1,
): readonly string[] | null {
  return movedCardIds(steps, stepId, offset);
}

/** Une étape de plus tient-elle encore sous la borne ? */
export function canAddStep(count: number): boolean {
  return canAddCard(count, DELIVERY_STEP_LIMITS);
}
