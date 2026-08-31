import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ChannelsForm } from '../channels/channels-form';
import { ProductFormStore } from '../../product-form-store';
import { numberValue } from '../dom';

/**
 * Panneau Tarif & TVA — le **prix public TTC**, ce qu'il devient pour les
 * professionnels, et les hors taxe qu'il produit contexte par contexte.
 *
 * Le régime était une section à part. Le lire demandait de replier celle-ci pour
 * déplier l'autre, alors que « 24,50 » et « TVA 5,5 % » sont une seule
 * information : ce qu'on facture. La maquette les met côte à côte, et elle a
 * raison.
 *
 * Le sens de lecture s'est INVERSÉ : on saisissait un hors taxe et l'écran
 * montrait les TTC ; on saisit le prix d'étiquette et l'écran montre les hors
 * taxe, un par taux. C'est la même page, lue depuis l'autre bout — et c'est le
 * bout par lequel une vitrine se pense.
 *
 * Le CHOIX d'assiette a disparu avec la décision de ne garder qu'un système :
 * un prix se saisit TTC, le hors taxe se calcule. Il n'y a donc plus de
 * ternaire sur l'étiquette du champ, ni de bascule sous lui.
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
