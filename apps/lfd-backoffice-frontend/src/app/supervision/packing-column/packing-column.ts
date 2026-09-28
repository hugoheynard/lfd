import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { FoldBadgeVariant } from 'fold-ng';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldMeterComponent,
} from 'fold-ng';

import type { PackingBoard, PackingCard, PackingState, UpcomingOrder } from '../packing-cards';
import { NO_QUALITY, type QualityBadge, type QualityRequest } from '../quality-badges';
import { countLabel } from '../supervision-labels';
import { SUPERVISION_LINKS } from '../supervision-links';
import { NO_MATCHES } from '../supervision-search';

/** La pastille Mono de chaque état : le libellé porte l'état, jamais la couleur seule. */
const BADGES: Readonly<Record<PackingState, { label: string; variant: FoldBadgeVariant }>> = {
  packed: { label: 'colisée', variant: 'success' },
  awaiting_oven: { label: 'attend le four', variant: 'warning' },
  in_progress: { label: 'en cours', variant: 'accent' },
  to_pack: { label: 'à coliser', variant: 'success' },
};

/**
 * **Colonne 2 · Colisage — l'unité est la commande.** Seule colonne où une
 * carte = un client. Ni cases de colis, ni Étiquettes, ni Bon de commande :
 * ce sont les gestes du poste, et la carte y renvoie (plan §1).
 *
 * Une commande COLISÉE se juge (`plan-controle-qualite.md`, §5) : elle porte
 * la pastille de son contrôle et, pour qui a le droit, « Contrôler ». Une
 * commande pas encore colisée ne se contrôle pas — rien n'y est fini.
 */
@Component({
  selector: 'app-packing-column',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldMeterComponent,
  ],
  templateUrl: './packing-column.html',
  styleUrl: './packing-column.scss',
})
export class PackingColumn {
  readonly board = input.required<PackingBoard>();
  readonly showLinks = input(false);
  readonly narrow = input(false);
  /** Ce que la recherche du masthead désigne, par numéro de commande. */
  readonly matches = input(NO_MATCHES);
  /** Les pastilles du contrôle qualité, par numéro de commande. */
  readonly quality = input(NO_QUALITY);
  /** `b2b_supervision:write` : le bouton « Contrôler ». */
  readonly canCheck = input(false);
  readonly check = output<QualityRequest>();

  protected readonly link = SUPERVISION_LINKS.packing;

  protected readonly empty = computed(
    () => this.board().visible.length === 0 && this.board().packed.length === 0,
  );

  protected readonly packedCount = computed(() =>
    countLabel(this.board().packed.length, 'commande colisée', 'commandes colisées'),
  );

  protected readonly overflowLabel = computed(
    () =>
      `+ ${countLabel(this.board().overflow, 'commande', 'commandes')} · triées par heure de retrait`,
  );

  protected qualityOf(card: PackingCard): QualityBadge | null {
    return this.quality().orders.get(card.reference) ?? null;
  }

  protected requestCheck(card: PackingCard): void {
    if (card.orderId === null) {
      return;
    }
    this.check.emit({
      target: { kind: 'order', orderId: card.orderId },
      title: card.customerLabel,
      subtitle: `Commande ${card.reference}`,
    });
  }

  protected badgeLabel(card: PackingCard): string {
    const label = BADGES[card.state].label;
    return card.state === 'in_progress' && card.initials.length > 0
      ? `${label} · ${card.initials.join(' ')}`
      : label;
  }

  protected badgeVariant(card: PackingCard): FoldBadgeVariant {
    return BADGES[card.state].variant;
  }

  protected meta(card: PackingCard): string {
    return `${card.reference} · ${String(card.lineCount)} réf. · ${countLabel(card.containers, 'bac', 'bacs')}`;
  }

  protected upcomingUnits(order: UpcomingOrder): string {
    return countLabel(order.totalUnits, 'pièce', 'pièces');
  }

  protected progressLabel(card: PackingCard): string {
    return `${String(card.packedLines)} références sur ${String(card.lineCount)} posées`;
  }
}
