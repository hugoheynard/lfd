import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import {
  FoldButtonComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { AddressCopy } from '../../gestures/address-copy';
import { factsOf, type ImageDescription } from '../../rules/image-description';

/**
 * La section **Informations** du panneau « Décrire une image » — ce que le
 * dépôt a mesuré, et les gestes qui partent de l'adresse : copier, voir où,
 * remplacer.
 *
 * Absente quand le dépôt n'a rien mesuré : une section vide ne dirait rien.
 */
@Component({
  selector: 'app-image-info-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageSectionComponent,
    FoldFieldListComponent,
    FoldFieldComponent,
    FoldButtonComponent,
  ],
  templateUrl: './image-info-section.html',
  styleUrl: './image-info-section.scss',
})
export class ImageInfoSection {
  private readonly addressCopy = inject(AddressCopy);

  readonly image = input.required<ImageDescription>();
  /** « Voir où » est offert. */
  readonly canShowCarriers = input(false);
  /** « Remplacer… » est offert. */
  readonly canReplace = input(false);
  /** Une saisie est en cours : le remplacement fermerait le panneau, il attend. */
  readonly locked = input(false);

  readonly showCarriers = output();
  readonly replace = output();

  /** Les informations, mises en forme ; `null` quand le dépôt ne les a pas mesurées. */
  protected readonly facts = computed(() => factsOf(this.image()));

  protected async copyAddress(): Promise<void> {
    await this.addressCopy.copy(this.image().url);
  }
}
