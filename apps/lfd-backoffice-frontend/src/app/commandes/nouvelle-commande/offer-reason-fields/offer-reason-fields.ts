import { ChangeDetectionStrategy, Component, computed, model } from '@angular/core';
import {
  ORDER_OFFER_NATURES,
  ORDER_OFFER_NOTE_MAX_LENGTH,
  type OrderOfferNature,
} from '@lfd/contracts';
import {
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldListboxComponent,
  FoldTextareaComponent,
} from 'fold-ng';

/**
 * **Le motif d'une commande offerte** — sa nature, son texte, et l'accord pour
 * prévenir le client (`plan-commande-offerte.md`, O-5, O5).
 *
 * Partagé par les deux saisies qui offrent : celle d'une société (le panier,
 * règlement « Offerte ») et celle d'un particulier (« Offrir cette
 * commande »). Il ne juge rien : les refus sont dits par le panier qui
 * l'accueille, et le serveur revalide.
 */
@Component({
  selector: 'app-offer-reason-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldListboxComponent,
    FoldTextareaComponent,
  ],
  templateUrl: './offer-reason-fields.html',
  styleUrl: './offer-reason-fields.scss',
})
export class OfferReasonFields {
  readonly nature = model<OrderOfferNature | null>(null);
  readonly note = model('');
  readonly notifyCustomer = model(false);

  /** Les natures d'une commande offerte, dans l'ordre du registre. */
  protected readonly natureOptions = ORDER_OFFER_NATURES.map((nature) => ({
    value: nature.key,
    label: nature.label,
  }));
  protected readonly noteHint = computed(
    () =>
      `Obligatoire, gardé avec la commande. ${String(this.note().trim().length)} / ${String(ORDER_OFFER_NOTE_MAX_LENGTH)} caractères.`,
  );

  protected onNature(value: OrderOfferNature | null): void {
    this.nature.set(value);
  }
}
