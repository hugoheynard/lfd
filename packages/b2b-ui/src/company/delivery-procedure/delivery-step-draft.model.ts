import {
  DELIVERY_PROCEDURE_MAX_STEPS,
  DELIVERY_STEP_BODY_MAX,
  DELIVERY_STEP_TITLE_MAX,
  type DeliveryProcedureStepView,
  type DeliveryStepFields,
} from '@lfd/contracts';

import type { DeliveryStepPhotoChange } from './delivery-procedure.gateway';

/**
 * Le brouillon d'une étape et ses dérivations — fonctions pures, testées sans
 * Angular. Le formulaire et l'éditeur n'en sont que l'affichage.
 */

/**
 * La photo telle qu'on la voit dans le formulaire : aucune, celle déjà
 * enregistrée (reconnue à sa révision), ou une nouvelle, déjà allégée.
 */
export type StepPhotoDraft =
  | { readonly kind: 'none' }
  | { readonly kind: 'kept'; readonly revision: string }
  | { readonly kind: 'picked'; readonly photo: Blob };

export interface DeliveryStepDraft {
  readonly title: string;
  readonly body: string;
  readonly photo: StepPhotoDraft;
}

export const EMPTY_DELIVERY_STEP_DRAFT: DeliveryStepDraft = {
  title: '',
  body: '',
  photo: { kind: 'none' },
};

/** Ce qui empêche d'enregistrer, ou `''`. */
export type DeliveryStepIssue = '' | 'title-required' | 'title-too-long' | 'body-too-long';

/** Le brouillon prérempli d'une étape qu'on refait. */
export function stepDraftFrom(step: DeliveryProcedureStepView): DeliveryStepDraft {
  return {
    title: step.title,
    body: step.body,
    photo:
      step.photoRevision === null
        ? { kind: 'none' }
        : { kind: 'kept', revision: step.photoRevision },
  };
}

/**
 * Le premier reproche du brouillon. Les longueurs se mesurent **après**
 * `trim()`, comme le contrat : des espaces de fin ne doivent pas faire refuser
 * un titre que le serveur accepterait.
 */
export function stepIssueOf(draft: DeliveryStepDraft): DeliveryStepIssue {
  const title = draft.title.trim();
  if (title === '') {
    return 'title-required';
  }
  if (title.length > DELIVERY_STEP_TITLE_MAX) {
    return 'title-too-long';
  }
  if (draft.body.trim().length > DELIVERY_STEP_BODY_MAX) {
    return 'body-too-long';
  }
  return '';
}

/** Les champs texte envoyés. */
export function toStepFields(draft: DeliveryStepDraft): DeliveryStepFields {
  return { title: draft.title.trim(), body: draft.body.trim() };
}

/** La photo d'une étape qu'on ajoute : la nouvelle, ou aucune. */
export function newStepPhotoOf(draft: DeliveryStepDraft): Blob | null {
  return draft.photo.kind === 'picked' ? draft.photo.photo : null;
}

/**
 * Ce qu'on fait de la photo d'une étape qu'on refait, par comparaison à
 * l'ouverture : une nouvelle la remplace, l'avoir retirée la retire, sinon on
 * n'y touche pas.
 */
export function photoChangeOf(
  draft: DeliveryStepDraft,
  initial: DeliveryStepDraft,
): DeliveryStepPhotoChange {
  if (draft.photo.kind === 'picked') {
    return { kind: 'replace', photo: draft.photo.photo };
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
export function isStepDraftChanged(draft: DeliveryStepDraft, initial: DeliveryStepDraft): boolean {
  return (
    draft.title.trim() !== initial.title.trim() ||
    draft.body.trim() !== initial.body.trim() ||
    draft.photo.kind === 'picked' ||
    draft.photo.kind !== initial.photo.kind
  );
}

/**
 * L'ordre obtenu en déplaçant une étape d'un rang, ou `null` si le geste sort
 * des bornes (monter la première, descendre la dernière) ou vise une étape
 * inconnue.
 */
export function movedStepIds(
  steps: readonly DeliveryProcedureStepView[],
  stepId: string,
  offset: -1 | 1,
): readonly string[] | null {
  const from = steps.findIndex((step) => step.id === stepId);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= steps.length) {
    return null;
  }
  const ids = steps.map((step) => step.id);
  [ids[from], ids[to]] = [ids[to] ?? '', ids[from] ?? ''];
  return ids;
}

/** Une étape de plus tient-elle encore sous la borne ? */
export function canAddStep(count: number): boolean {
  return count < DELIVERY_PROCEDURE_MAX_STEPS;
}
