import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldInputComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { NotifyService } from '../../../../notify.service';
import { pickupDirectLink, SHOP_PUBLIC_URL_TOKEN } from '../../pickup-direct-link';

/**
 * **Le lien direct d'un point de retrait** — à recopier derrière le bouton
 * « Commander » de sa fiche Google My Business. Lecture seule : il se déduit
 * de l'identifiant du point et de l'adresse publique de la boutique.
 */
@Component({
  selector: 'app-site-direct-link-card',
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldInputComponent,
    FoldPageSectionComponent,
  ],
  templateUrl: './site-direct-link-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteDirectLinkCard {
  private readonly notify = inject(NotifyService);
  private readonly shopUrl = inject(SHOP_PUBLIC_URL_TOKEN);

  readonly pickupId = input.required<string>();

  /** `null` : l'adresse de la boutique n'est pas configurée pour ce back-office. */
  protected readonly link = computed(() => pickupDirectLink(this.shopUrl, this.pickupId()));

  protected async copy(): Promise<void> {
    const link = this.link();
    if (link === null) {
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      this.notify.success('Lien copié.');
    } catch (error) {
      this.notify.error(error, 'Copie impossible — sélectionnez le lien à la main.');
    }
  }
}
