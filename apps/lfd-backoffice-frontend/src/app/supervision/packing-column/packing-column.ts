import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { FoldBadgeVariant } from 'fold-ng';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLinkComponent,
  FoldMeterComponent,
} from 'fold-ng';

import type { PackingBoard, PackingCard, PackingState } from '../packing-cards';
import { countLabel } from '../supervision-labels';
import { SUPERVISION_LINKS } from '../supervision-links';

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
    FoldLinkComponent,
    FoldMeterComponent,
  ],
  templateUrl: './packing-column.html',
  styleUrl: './packing-column.scss',
})
export class PackingColumn {
  readonly board = input.required<PackingBoard>();
  readonly showLinks = input(false);
  readonly narrow = input(false);

  protected readonly link = SUPERVISION_LINKS.packing;
  protected readonly unfolded = signal(false);

  protected readonly empty = computed(
    () => this.board().visible.length === 0 && this.board().packed.length === 0,
  );

  protected readonly packedNames = computed(() =>
    this.board()
      .packed.map((card) => card.customerLabel)
      .join(', '),
  );

  protected readonly packedCount = computed(() =>
    countLabel(this.board().packed.length, 'commande colisée', 'commandes colisées'),
  );

  protected readonly overflowLabel = computed(
    () =>
      `+ ${countLabel(this.board().overflow, 'commande', 'commandes')} · triées par heure de retrait`,
  );

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

  protected progressLabel(card: PackingCard): string {
    return `${String(card.packedLines)} références sur ${String(card.lineCount)} posées`;
  }

  protected toggle(): void {
    this.unfolded.update((open) => !open);
  }
}
