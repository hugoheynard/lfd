import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { FoldBadgeComponent, type FoldBadgeVariant, FoldButtonIconComponent } from 'fold-ng';

import { formatEurValue } from '../../data/catalogue-seed';
import { orderStatusLabel, orderStatusVariant } from '@lfd/b2b-ui/order';
import type { CommandeRow as Order } from '../orders-demo-seed';

/**
 * Comment lire la commande :
 * - `periodic` : au relevé mensuel → le badge porte le **statut** de la commande ;
 * - `paid` : payée à la commande → le badge porte **« Payé »**.
 */
export type CommandeRowMode = 'periodic' | 'paid';

/**
 * **Une commande, sur une ligne** — la brique réutilisable partagée par les deux
 * colonnes (paiement périodique / payé à la commande). Même gabarit des deux
 * côtés : réf · date · badge · lieu · total · télécharger ; seul le badge change
 * selon le `mode`, d'où un rendu consistant.
 */
@Component({
  selector: 'app-commande-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldButtonIconComponent],
  templateUrl: './commande-row.html',
  styleUrl: './commande-row.scss',
})
export class CommandeRow {
  readonly order = input.required<Order>();
  readonly mode = input<CommandeRowMode>('periodic');

  readonly download = output<Order>();

  protected readonly badgeLabel = computed(() =>
    this.mode() === 'paid' ? 'Payé' : orderStatusLabel(this.order().status),
  );
  protected readonly badgeVariant = computed<FoldBadgeVariant>(() =>
    this.mode() === 'paid' ? 'success' : orderStatusVariant(this.order().status),
  );

  protected fmt(value: number): string {
    return formatEurValue(value);
  }

  protected day(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  }

  protected onDownload(): void {
    this.download.emit(this.order());
  }
}
