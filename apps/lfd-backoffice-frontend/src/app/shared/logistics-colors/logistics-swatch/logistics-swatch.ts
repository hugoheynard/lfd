import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { inkOn, type LogisticsCategory } from '../logistics-category';

/**
 * **La pastille d'une catégorie logistique** — sa couleur et son nom (« Livraison
 * pro », « Retrait particulier Adroit »…), posée sur le tableau des tournées,
 * le chargement et « Ma tournée » (plan `commandes/back-office/plan-tri-depart-et-couleurs.md`,
 * L1b).
 *
 * Les couleurs sont LIBRES : l'encre (claire ou sombre) se choisit par
 * luminance, sans quoi un jaune saisi serait illisible. Sans couleur, la
 * teinte neutre de fold — jamais une couleur inventée.
 */
@Component({
  selector: 'app-logistics-swatch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './logistics-swatch.html',
  styleUrl: './logistics-swatch.scss',
})
export class LogisticsSwatch {
  readonly category = input.required<LogisticsCategory>();

  protected readonly ink = computed(() => {
    const color = this.category().color;
    return color === null ? 'neutral' : inkOn(color);
  });
}
