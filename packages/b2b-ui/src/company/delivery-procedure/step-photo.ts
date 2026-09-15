import { DELIVERY_STEP_PHOTO_LONG_EDGE, DELIVERY_STEP_PHOTO_MAX_BYTES } from '@lfd/contracts';

import {
  photoFrame,
  reducePhoto,
  type PhotoEncoder,
  type PhotoFrame,
  type PhotoReduction,
  type PhotoReductionPolicy,
} from '../../photo-cards/photo-reduction';

/**
 * La photo d'une étape : la réduction du socle photo-cartes, **à la politique
 * de la procédure**. Les noms publiés restent ; l'arithmétique vit dans le socle.
 */

/**
 * Les compressions essayées, dans l'ordre. 0.8 d'abord : une porte, un
 * digicode, une cour se lisent très bien à ce taux. 0.6 seulement si la
 * première passe dépasse la borne du serveur — une photo très détaillée (du
 * feuillage, un mur de briques) peut encore peser lourd à 1600 px.
 */
export const DELIVERY_STEP_PHOTO_QUALITIES: readonly number[] = [0.8, 0.6];

/** Ce que la procédure exige d'une photo : 1600 px, 0.8 puis 0.6, 1 Mo au plus. */
export const DELIVERY_STEP_PHOTO_POLICY: PhotoReductionPolicy = {
  longEdge: DELIVERY_STEP_PHOTO_LONG_EDGE,
  qualities: DELIVERY_STEP_PHOTO_QUALITIES,
  maxBytes: DELIVERY_STEP_PHOTO_MAX_BYTES,
};

export type StepPhotoFrame = PhotoFrame;

/** Peint la photo à cette taille et à cette qualité ; `null` si le navigateur n'a rien rendu. */
export type StepPhotoEncoder = PhotoEncoder;

/** Ce que la réduction rend : la photo prête à partir, ou pourquoi il n'y en a pas. */
export type StepPhotoReduction = PhotoReduction;

/** La taille à laquelle peindre une photo d'étape, grand côté borné à {@link DELIVERY_STEP_PHOTO_LONG_EDGE}. */
export function stepPhotoFrame(width: number, height: number): StepPhotoFrame {
  return photoFrame(width, height, DELIVERY_STEP_PHOTO_LONG_EDGE);
}

/** Réduit une photo d'étape selon {@link DELIVERY_STEP_PHOTO_POLICY}. */
export function reduceStepPhoto(
  source: StepPhotoFrame,
  encode: StepPhotoEncoder,
): Promise<StepPhotoReduction> {
  return reducePhoto(source, encode, DELIVERY_STEP_PHOTO_POLICY);
}
