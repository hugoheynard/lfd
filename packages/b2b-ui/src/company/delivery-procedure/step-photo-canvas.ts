import { shrinkPhoto } from '../../photo-cards/photo-reduction-canvas';
import { DELIVERY_STEP_PHOTO_POLICY, type StepPhotoReduction } from './step-photo';

/**
 * L'adaptateur **navigateur** de la photo d'une étape : celui du socle, à la
 * politique de la procédure.
 */
export function shrinkStepPhoto(file: Blob): Promise<StepPhotoReduction> {
  return shrinkPhoto(file, DELIVERY_STEP_PHOTO_POLICY);
}
