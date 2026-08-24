import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ChannelsForm } from '../channels/channels-form';
import { ProductFormStore } from '../../product-form-store';
import { numberValue } from '../dom';

/**
 * Panneau Tarif & TVA — le prix canonique HT, le poids de l'unité vendue, et le
 * régime dont ils héritent.
 *
 * Le régime était une section à part. Le lire demandait de replier celle-ci pour
 * déplier l'autre, alors que « 24,50 » et « TVA 5,5 % » sont une seule
 * information : ce qu'on facture. La maquette les met côte à côte, et elle a
 * raison.
 */
@Component({
  selector: 'app-pricing-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChannelsForm],
  templateUrl: './pricing-form.html',
  styleUrls: ['../form-section.scss', './pricing-form.scss'],
})
export class PricingForm {
  protected readonly store = inject(ProductFormStore);
  protected readonly numberValue = numberValue;
}
