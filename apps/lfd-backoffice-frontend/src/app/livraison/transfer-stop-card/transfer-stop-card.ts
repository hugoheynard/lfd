import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { DeliveryRoundTransferStopView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldListboxComponent,
  type FoldSelectOption,
} from 'fold-ng';

/** Déplacer un arrêt de transfert vers une autre tournée. */
export interface TransferStopMove {
  readonly stopId: string;
  /** La clé (l'identifiant) de la tournée de destination. */
  readonly toKey: string;
}

/**
 * **Un arrêt de transfert interne dans une colonne de tournée** (plan du
 * transfert interne, §5 : « → Val Village · N commandes », sans client ni
 * adresse). Il ne se glisse pas comme une commande : il se déplace vers une
 * autre tournée, se retire, et montre son manifeste.
 */
@Component({
  selector: 'app-transfer-stop-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldListboxComponent,
  ],
  templateUrl: './transfer-stop-card.html',
  styleUrl: './transfer-stop-card.scss',
})
export class TransferStopCard {
  readonly stop = input.required<DeliveryRoundTransferStopView>();
  /** Écrire et tournée non partie. */
  readonly movable = input(false);
  readonly busy = input(false);
  /** Les autres tournées du jour où l'arrêt peut aller. */
  readonly targets = input<readonly FoldSelectOption<string>[]>([]);

  readonly manifest = output<DeliveryRoundTransferStopView>();
  readonly removed = output<string>();
  readonly moved = output<TransferStopMove>();

  protected readonly title = computed(() => `→ ${this.stop().siteLabel}`);

  protected readonly subtitle = computed(() => {
    const { position } = this.stop();
    return `Arrêt ${position} · transfert · ${carriedLabel(this.stop())}`;
  });

  protected move(toKey: string): void {
    this.moved.emit({ stopId: this.stop().stopId, toKey });
  }
}

/**
 * « 2 commandes · 3 réassorts », ou « 3 réassorts » seul : un transfert de
 * réassort seul (R3c) ne se lit pas « 0 commande ». Ni l'un ni l'autre : le
 * compte des commandes, comme avant.
 */
export function carriedLabel(stop: DeliveryRoundTransferStopView): string {
  const resupplies = stop.resupplyCount ?? 0;
  const orders = plural(stop.orderCount, 'commande', 'commandes');
  if (resupplies === 0) {
    return orders;
  }
  const resupplyPart = plural(resupplies, 'réassort', 'réassorts');
  return stop.orderCount === 0 ? resupplyPart : `${orders} · ${resupplyPart}`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
