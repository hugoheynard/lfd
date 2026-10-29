import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldCalloutComponent, FoldViewToggleComponent, type FoldViewToggleOption } from 'fold-ng';

import { ChannelsForm } from '../channels/channels-form';
import { ProductFormStore } from '../../product-form-store';
import { numberValue, textValue } from '../dom';

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
  imports: [ChannelsForm, FoldCalloutComponent, FoldViewToggleComponent],
  templateUrl: './pricing-form.html',
  styleUrls: ['../form-section.scss', './pricing-form.scss'],
})
export class PricingForm {
  protected readonly store = inject(ProductFormStore);
  protected readonly numberValue = numberValue;
  protected readonly textValue = textValue;

  /** Au poids, les prix sont au kilo et le pas et le minimum s'affichent (P1). */
  protected readonly byWeight = computed(() => this.store.saleUnit() === 'weight');

  /** Où la référence a servi, dit comme le refus du serveur. */
  protected readonly usedLabels = computed(() => {
    const usage = this.store.saleUnitUsage();
    return usage.state === 'used' ? usage.labels.join(', ') : '';
  });

  /**
   * Le refus du serveur, montré DANS la carte quand l'enregistrement du tarif
   * a échoué — la course où la référence a servi entre la lecture et le geste.
   */
  protected readonly saleUnitRefusal = computed(() =>
    this.store.hasFailed('tarif') ? this.store.error() : null,
  );

  /** Les deux segments, éteints tant que la référence n'est pas connue libre. */
  protected readonly saleUnitOptions = computed((): readonly FoldViewToggleOption[] => {
    const disabled = this.store.saleUnitLocked();
    return [
      { value: 'piece', label: 'Vendre à la pièce', disabled },
      { value: 'weight', label: 'Vendre au poids', disabled },
    ];
  });

  protected setSaleUnit(value: string): void {
    if (this.store.saleUnitLocked()) {
      return;
    }
    this.store.saleUnit.set(value === 'weight' ? 'weight' : 'piece');
  }
}
