import { DELIVERY_STEP_PHOTO_LONG_EDGE, DELIVERY_STEP_PHOTO_MAX_BYTES } from '@lfd/contracts';

/**
 * L'arithmétique de la photo d'une étape — séparée du canvas parce qu'un
 * canvas ne se peint pas dans un test, et que c'est ici que vivent les deux
 * décisions qui comptent : la taille, et quand renoncer.
 */

/**
 * Les compressions essayées, dans l'ordre. 0.8 d'abord : une porte, un
 * digicode, une cour se lisent très bien à ce taux. 0.6 seulement si la
 * première passe dépasse la borne du serveur — une photo très détaillée (du
 * feuillage, un mur de briques) peut encore peser lourd à 1600 px.
 */
export const DELIVERY_STEP_PHOTO_QUALITIES: readonly number[] = [0.8, 0.6];

export interface StepPhotoFrame {
  readonly width: number;
  readonly height: number;
}

/**
 * La taille à laquelle peindre une photo d'étape, grand côté borné à
 * {@link DELIVERY_STEP_PHOTO_LONG_EDGE}.
 *
 * Le rapport est préservé, et une image déjà plus petite n'est **jamais**
 * agrandie : on n'inventerait que du poids.
 */
export function stepPhotoFrame(width: number, height: number): StepPhotoFrame {
  const longEdge = Math.max(width, height);
  if (longEdge <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(1, DELIVERY_STEP_PHOTO_LONG_EDGE / longEdge);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Peint la photo à cette taille et à cette qualité ; `null` si le navigateur n'a rien rendu. */
export type StepPhotoEncoder = (frame: StepPhotoFrame, quality: number) => Promise<Blob | null>;

/** Ce que la réduction rend : la photo prête à partir, ou pourquoi il n'y en a pas. */
export type StepPhotoReduction =
  | { readonly kind: 'ready'; readonly photo: Blob }
  | { readonly kind: 'too-heavy' }
  | { readonly kind: 'unreadable' };

/**
 * Réduit une photo avant l'envoi : une passe par qualité de
 * {@link DELIVERY_STEP_PHOTO_QUALITIES}, la première qui tient sous
 * {@link DELIVERY_STEP_PHOTO_MAX_BYTES} gagne.
 *
 * Trop lourde après la dernière passe, elle est **refusée ici** plutôt
 * qu'envoyée : le serveur la refuserait de toute façon, après l'attente du
 * téléversement.
 */
export async function reduceStepPhoto(
  source: StepPhotoFrame,
  encode: StepPhotoEncoder,
): Promise<StepPhotoReduction> {
  const frame = stepPhotoFrame(source.width, source.height);
  if (frame.width === 0) {
    return { kind: 'unreadable' };
  }
  for (const quality of DELIVERY_STEP_PHOTO_QUALITIES) {
    const photo = await encode(frame, quality);
    if (photo === null) {
      return { kind: 'unreadable' };
    }
    if (photo.size <= DELIVERY_STEP_PHOTO_MAX_BYTES) {
      return { kind: 'ready', photo };
    }
  }
  return { kind: 'too-heavy' };
}
