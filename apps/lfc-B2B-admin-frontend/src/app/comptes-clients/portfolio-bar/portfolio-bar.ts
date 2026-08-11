import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

import type { PortfolioMetricsView } from '@lfd/contracts';

/**
 * La **barre de tête** des Comptes clients : l'état du portefeuille avant la
 * liste.
 *
 * Trois questions, dans l'ordre où on se les pose en ouvrant l'écran : combien
 * de clients servons-nous (et grandit-on ?), comment vont-ils un par un, et
 * qu'est-ce qui bloque à l'encaissement.
 *
 * Le **pouls** est délibérément en trois nombres plutôt qu'en une flèche : un
 * portefeuille peut afficher un CA en hausse tout en perdant la moitié de ses
 * comptes, si un gros client masque les autres. Trois nombres disent où est le
 * travail ; une flèche dirait seulement si le mois a été bon.
 */
@Component({
  selector: 'app-portfolio-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  templateUrl: './portfolio-bar.html',
  styleUrl: './portfolio-bar.scss',
})
export class PortfolioBar {
  readonly metrics = input.required<PortfolioMetricsView | null>();

  /** Combien de comptes le pouls a réellement classés — le reste n'a rien vendu. */
  protected readonly measured = computed(() => {
    const pulse = this.metrics()?.pulse;
    return pulse === undefined ? 0 : pulse.growing + pulse.flat + pulse.shrinking;
  });
}
