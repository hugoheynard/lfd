import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { FoldInputComponent, FoldTimeComponent } from 'fold-ng';

import {
  EMPTY_ADDRESS,
  EMPTY_WINDOW,
  type DictatedAddress,
  type TypedWindow,
} from '../particular-offer-draft';

/**
 * **L'adresse dictée et la tranche d'une livraison offerte à un particulier**
 * (`plan-commande-offerte.md`, O7-4). Un particulier n'a pas de carnet chez
 * l'équipe : l'adresse se tape, et ne s'enregistre nulle part ailleurs que
 * sur la commande. La desserte et l'ouverture aux particuliers sont jugées
 * par le serveur, qui les dit dans le devis.
 */
@Component({
  selector: 'app-particular-delivery-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldInputComponent, FoldTimeComponent],
  templateUrl: './particular-delivery-fields.html',
  styleUrl: './particular-delivery-fields.scss',
})
export class ParticularDeliveryFields {
  readonly address = model<DictatedAddress>(EMPTY_ADDRESS);
  readonly window = model<TypedWindow>(EMPTY_WINDOW);

  protected onField(field: keyof DictatedAddress, value: string): void {
    this.address.update((address) => ({ ...address, [field]: value }));
  }

  protected onBound(bound: keyof TypedWindow, value: string): void {
    this.window.update((window) => ({ ...window, [bound]: value }));
  }
}
