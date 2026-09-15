import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

import { PhotoCardForm } from '../../../photo-cards/photo-card-form/photo-card-form';
import {
  DELIVERY_STEP_FORM_LABELS_FR,
  type DeliveryStepFormLabels,
} from '../delivery-procedure.labels';
import { DELIVERY_STEP_LIMITS, type DeliveryStepDraft } from '../delivery-step-draft.model';
import { DELIVERY_STEP_PHOTO_POLICY } from '../step-photo';

/**
 * Le **formulaire d'une étape** : titre, texte, photo. C'est le formulaire du
 * socle photo-cartes aux bornes et à la politique de photo de la procédure,
 * sous le nom et avec les libellés que ses consommateurs connaissent.
 */
@Component({
  selector: 'lfd-delivery-step-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PhotoCardForm],
  templateUrl: './delivery-step-form.html',
})
export class DeliveryStepForm {
  readonly value = model.required<DeliveryStepDraft>();
  readonly labels = input<DeliveryStepFormLabels>(DELIVERY_STEP_FORM_LABELS_FR);
  /** L'image de la photo déjà enregistrée, quand le brouillon la garde. */
  readonly currentPhotoUrl = input<string | null>(null);

  protected readonly limits = DELIVERY_STEP_LIMITS;
  protected readonly photoPolicy = DELIVERY_STEP_PHOTO_POLICY;
}
