import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import type { DeliveryContact, WindowMode } from '@lfd/contracts';
import { FoldCalloutComponent, FoldCheckboxComponent, FoldNumberInputComponent } from 'fold-ng';

import { AddressForm } from '../../address/address-form/address-form';
import { ALL_POSTAL_FIELDS, type PostalAddress } from '../../address/address.model';
import {
  type DeliveryDraft,
  STOP_MINUTES_MAX,
  STOP_MINUTES_MIN,
  stopMinutesIssueOf,
} from '../delivery-draft.model';
import { DeliverySpecs } from '../delivery-specs/delivery-specs';
import { toPostal, withPostal } from '../postal-draft.model';
import {
  DELIVERY_ADDRESS_FORM_LABELS_FR,
  type DeliveryAddressFormLabels,
  withDefault,
} from './delivery-address-form.model';

/**
 * Le **formulaire d'une adresse de livraison** — le rang, le lieu, et comment
 * on y livre. Rien d'autre : ni en-tête, ni bouton, ni écriture.
 *
 * Il sert le back-office (`DeliveryAddressPanel`) et l'app cliente (le dialogue
 * de `/mon-compte`) : la parité de champs entre les deux tient par
 * construction, et un champ ajouté ici apparaît des deux côtés à la fois.
 * Chacun garde son cadre, son chemin d'écriture et sa langue.
 *
 * Fragment transparent (`display: contents`) : ses trois blocs deviennent
 * enfants directs du corps du panneau, qui gouverne l'espacement.
 */
@Component({
  selector: 'lfd-delivery-address-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AddressForm,
    DeliverySpecs,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldNumberInputComponent,
  ],
  templateUrl: './delivery-address-form.html',
  styleUrl: './delivery-address-form.scss',
})
export class DeliveryAddressForm {
  /** Le brouillon de livraison (two-way) : postal, rang et consignes. */
  readonly value = model.required<DeliveryDraft>();

  /** Le socle de signature de la société, montré dans l'option « comme la société ». */
  readonly signatureFloor = input.required<boolean>();

  /** Contacts connus de l'entreprise, proposés pour préremplir le contact sur place. */
  readonly knownContacts = input.required<readonly DeliveryContact[]>();

  /** Les mots du formulaire ; le défaut est le français d'avant la mutualisation. */
  readonly labels = input<DeliveryAddressFormLabels>(DELIVERY_ADDRESS_FORM_LABELS_FR);

  /**
   * Montrer le **temps de livraison sur place** (L7b-C4). Faux par défaut :
   * c'est un réglage d'organisation que le client ne connaît pas — seul le
   * back-office l'ouvre. Masqué, la valeur voyage quand même dans le brouillon.
   */
  readonly showStopMinutes = input(false);

  /** Le réglage général « créneau ou échéance », dont l'adresse hérite (CA-D2). */
  readonly globalWindowMode = input<WindowMode>('slot');

  protected readonly stopMinutesMin = STOP_MINUTES_MIN;
  protected readonly stopMinutesMax = STOP_MINUTES_MAX;
  protected readonly stopMinutesError = computed(() => stopMinutesIssueOf(this.value()));

  /** Le point GPS et la note ne se demandent qu'ici : c'est le livreur qui cherche l'entrée. */
  protected readonly fields = ALL_POSTAL_FIELDS;

  protected readonly postal = computed(() => toPostal(this.value()));

  protected setPostal(postal: PostalAddress): void {
    this.value.update((draft) => withPostal(draft, postal));
  }

  protected setStopMinutes(stopMinutes: number | null): void {
    this.value.update((draft) => ({ ...draft, stopMinutes }));
  }

  protected setDefault(isDefault: boolean): void {
    this.value.update((draft) => withDefault(draft, isDefault));
  }
}
