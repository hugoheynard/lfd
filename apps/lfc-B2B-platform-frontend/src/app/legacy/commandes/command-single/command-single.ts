import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { type FoldBadgeVariant, FoldCardComponent } from 'fold-ng';

import { CommandeRow, type CommandeRowMode } from '../commande-row/commande-row';
import type { CommandeRow as Order } from '../orders-demo-seed';

/**
 * **Une commande, sa propre carte** — une `fold-card` d'une seule ligne qui
 * encapsule un `commande-row`. Sert la colonne « à la commande » : chaque
 * commande est une carte indépendante (on voit le fond de page entre elles). Le
 * **liseré de couleur** à gauche (`tone`) indique le statut.
 */
@Component({
  selector: 'app-command-single',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, CommandeRow],
  templateUrl: './command-single.html',
  styleUrl: './command-single.scss',
  host: { '[attr.data-tone]': 'tone()' },
})
export class CommandSingle {
  readonly order = input.required<Order>();
  readonly mode = input<CommandeRowMode>('paid');
  readonly tone = input<FoldBadgeVariant>('neutral');

  readonly download = output<Order>();

  protected onDownload(order: Order): void {
    this.download.emit(order);
  }
}
