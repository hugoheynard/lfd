import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { type FoldBadgeVariant, FoldCardComponent } from 'fold-ng';

import { CommandeRow, type CommandeRowMode } from '../commande-row/commande-row';
import type { CommandeRow as Order } from '../orders-demo-seed';

/**
 * **La carte d'un relevé** — une `fold-card` scindée : à **gauche** l'info
 * projetée (`[info]` : mois, balance, boutons de règlement), à **droite**
 * l'empilement des `commande-row` du relevé. Un **liseré de couleur** à gauche
 * (piloté par `tone`) indique le statut.
 */
@Component({
  selector: 'app-command-period-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, CommandeRow],
  templateUrl: './command-period-card.html',
  styleUrl: './command-period-card.scss',
  host: { '[attr.data-tone]': 'tone()' },
})
export class CommandPeriodCard {
  readonly orders = input.required<readonly Order[]>();
  readonly mode = input<CommandeRowMode>('periodic');
  readonly tone = input<FoldBadgeVariant>('neutral');

  readonly download = output<Order>();

  protected onDownload(order: Order): void {
    this.download.emit(order);
  }
}
