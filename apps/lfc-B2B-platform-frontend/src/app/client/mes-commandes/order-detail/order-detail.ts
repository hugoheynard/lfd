import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FoldButtonComponent } from 'fold-ng';

import { ClientCopyService } from '../../copy/client-copy.service';
import type { HistoryOrder } from '../../mock-orders';

/** Une note de 1 à 5. Zéro veut dire « pas encore notée », pas « zéro étoile ». */
const STARS = [1, 2, 3, 4, 5] as const;

/**
 * Le TIROIR d'une commande — ce que le dépli montre sous sa ligne.
 *
 * Il est sorti de la table au moment où son gabarit a dépassé la soixantaine de
 * lignes : celui d'une cellule tient sur une ligne, celui-ci racontait trois
 * choses différentes — les faits, les gestes, la note. Une table dont le
 * gabarit est aux trois quarts un tiroir n'est plus lisible comme une table.
 *
 * Il ne décide de RIEN. La note lui arrive et repart : elle vit dans la table,
 * qui survit à la fermeture du tiroir — un composant détruit à chaque repli
 * emporterait l'étoile qu'on vient de donner. Le signalement remonte aussi,
 * parce que deux surfaces peuvent l'accueillir et que ce n'est pas au tiroir de
 * choisir laquelle.
 */
@Component({
  selector: 'app-order-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent],
  templateUrl: './order-detail.html',
  styleUrl: './order-detail.scss',
})
export class OrderDetail {
  readonly order = input.required<HistoryOrder>();

  /** La note donnée, de 0 (aucune) à 5. */
  readonly rate = input(0);

  readonly rated = output<number>();
  readonly problemRaised = output<void>();

  protected readonly t = inject(ClientCopyService).t;
  protected readonly stars = STARS;

  protected readonly paymentLabel = computed(() => {
    const copy = this.t().orders;
    const labels = {
      account: copy.payAccount,
      card: copy.payCard,
      due: copy.payDue,
    };
    return labels[this.order().payment];
  });

  protected readonly paymentNote = computed(() => {
    const copy = this.t().orders;
    const notes = {
      account: copy.payAccountNote,
      card: copy.payCardNote,
      due: copy.payDueNote,
    };
    return notes[this.order().payment];
  });

  /**
   * Le libellé de la note — il RÉPOND au geste, et différemment.
   *
   * Au-dessus de 4 on remercie ; en dessous on annonce qu'on regarde. Jamais une
   * pop-up : la note se donne là où la commande vit.
   */
  protected readonly rateLabel = computed(() => {
    const copy = this.t().orders;
    const value = this.rate();
    if (value === 0) {
      return copy.rateIdle;
    }
    return value >= 4 ? copy.rateHigh : copy.rateLow;
  });

  protected starLabel(value: number): string {
    return this.t().orders.rateStar.replace('{n}', String(value));
  }
}
