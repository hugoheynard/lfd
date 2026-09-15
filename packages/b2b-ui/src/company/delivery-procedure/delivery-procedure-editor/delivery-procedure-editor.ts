import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { PhotoCardFormSlot } from '../../../photo-cards/photo-card-form-slot';
import { PhotoCardsEditor } from '../../../photo-cards/photo-cards-editor/photo-cards-editor';
import { DeliveryProcedureGateway, deliveryStepsOf } from '../delivery-procedure.gateway';
import {
  DELIVERY_PROCEDURE_EDITOR_LABELS_FR,
  photoCardsLabelsOf,
  type DeliveryProcedureEditorLabels,
} from '../delivery-procedure.labels';
import { DELIVERY_STEP_LIMITS } from '../delivery-step-draft.model';
import { DeliveryStepForm } from '../delivery-step-form/delivery-step-form';

/**
 * L'**éditeur de la procédure de livraison** d'une adresse : les étapes dans
 * l'ordre, leur photo, et les gestes qui les font évoluer.
 *
 * C'est l'éditeur du socle photo-cartes aux couleurs de la procédure : il lie
 * la passerelle à l'adresse, fixe les bornes du contrat (ajout en fin, 20
 * étapes) et traduit ses libellés. Le numéro affiché est celui que sert le
 * serveur (`number`), jamais recalculé depuis le rang.
 */
@Component({
  selector: 'lfd-delivery-procedure-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PhotoCardsEditor, PhotoCardFormSlot, DeliveryStepForm],
  templateUrl: './delivery-procedure-editor.html',
})
export class DeliveryProcedureEditor {
  private readonly gateway = inject(DeliveryProcedureGateway);

  readonly addressId = input.required<string>();
  /** Sans, lecture seule : ni ajout, ni déplacement, ni correction. */
  readonly canEdit = input(false);
  readonly labels = input<DeliveryProcedureEditorLabels>(DELIVERY_PROCEDURE_EDITOR_LABELS_FR);

  /**
   * Le nombre d'étapes, à chaque fois qu'il change après la première lecture —
   * de quoi rafraîchir le « N étapes » affiché sous l'adresse.
   */
  readonly stepCountChange = output<number>();

  protected readonly steps = computed(() => deliveryStepsOf(this.gateway, this.addressId()));
  protected readonly cardLabels = computed(() => photoCardsLabelsOf(this.labels()));
  protected readonly limits = DELIVERY_STEP_LIMITS;
}
