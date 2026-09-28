import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { WorkshopLine } from '@lfd/contracts';
import { RouterLink } from '@angular/router';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDisclosureComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldMeterComponent,
} from 'fold-ng';

import {
  type LineProgress,
  lineProgressOf,
  type PreparationBoard,
  type ShelfCard,
} from '../preparation-shelves';
import { NO_QUALITY, type QualityBadge, type QualityRequest, worstBadge } from '../quality-badges';
import { countLabel } from '../supervision-labels';
import { NO_MATCHES } from '../supervision-search';
import { SUPERVISION_LINKS } from '../supervision-links';

/** Une ligne du détail, et la liste du serveur qui la porte. */
interface ShelfLine {
  readonly line: WorkshopLine;
  readonly done: boolean;
}

/**
 * **Colonne 1 · Préparation — l'unité est le produit.** Une carte par rayon,
 * dépliable sur toutes ses lignes — à sortir, puis sorties avec leurs
 * initiales —, listées **sans case à cocher** : cocher est le
 * geste de la fournée, et la Supervision n'agit pas (plan §1). Le renvoi
 * « Ouvrir la fournée » n'est montré qu'à qui peut l'ouvrir.
 *
 * Le seul geste est de JUGER (`plan-controle-qualite.md`, §5) : chaque ligne
 * porte la pastille de son contrôle et, pour qui a le droit, « Contrôler » ;
 * le rayon porte la pire pastille de ses lignes.
 */
@Component({
  selector: 'app-preparation-column',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDisclosureComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldMeterComponent,
  ],
  templateUrl: './preparation-column.html',
  styleUrl: './preparation-column.scss',
})
export class PreparationColumn {
  readonly board = input.required<PreparationBoard>();
  readonly showLinks = input(false);
  readonly narrow = input(false);
  /** Ce que la recherche du masthead désigne — les produits des commandes trouvées. */
  readonly matches = input(NO_MATCHES);
  /** Les pastilles du contrôle qualité, par SKU. */
  readonly quality = input(NO_QUALITY);
  /** `b2b_supervision:write` : le bouton « Contrôler ». */
  readonly canCheck = input(false);
  readonly check = output<QualityRequest>();

  protected readonly link = SUPERVISION_LINKS.preparation;
  protected readonly empty = computed(
    () => this.board().open.length === 0 && this.board().finished.length === 0,
  );

  /**
   * Ce qui reste au four, puis les rayons finis — **visibles, en bas** (Hugo,
   * 2026-09-28). Ils se repliaient en une ligne de noms : on ne voyait plus ce
   * qui était sorti, ni en quelle quantité.
   */
  protected readonly shown = computed<readonly ShelfCard[]>(() => [
    ...this.board().open,
    ...this.board().finished,
  ]);

  /** Le rayon porte-t-il un produit d'une commande cherchée ? */
  protected shelfMatches(card: ShelfCard): boolean {
    const skus = this.matches().skus;
    return [...card.pending, ...card.done].some((line) => skus.has(line.sku));
  }

  /**
   * À sortir, puis sorties — l'ordre de la fiche dans chacune. « Sortie » se
   * lit à la liste qui porte la ligne, comme avant : c'est le serveur qui range.
   */
  protected linesOf(card: ShelfCard): readonly ShelfLine[] {
    return [
      ...card.pending.map((line) => ({ line, done: false })),
      ...card.done.map((line) => ({ line, done: true })),
    ];
  }

  /** La barre `produced / quantity` de la ligne, et son surplus. */
  protected progressOf(line: WorkshopLine): LineProgress {
    return lineProgressOf(line);
  }

  protected lineBadge(line: WorkshopLine): QualityBadge | null {
    return this.quality().lines.get(line.sku) ?? null;
  }

  /** La pire pastille des lignes du rayon — ce que dit le rayon replié. */
  protected shelfBadge(card: ShelfCard): QualityBadge | null {
    return worstBadge(this.linesOf(card).map(({ line }) => this.lineBadge(line)));
  }

  protected requestCheck(line: WorkshopLine): void {
    this.check.emit({
      target: { kind: 'line', sku: line.sku },
      title: line.productName,
      subtitle: `${countLabel(line.quantity, 'pièce', 'pièces')} au compte`,
    });
  }

  protected meterLabel(card: ShelfCard): string {
    return card.state === 'done'
      ? `Rayon terminé · ${String(card.totalUnits)} pièces sorties`
      : `${String(card.remainingUnits)} pièces restantes`;
  }

  protected meterTone(card: ShelfCard): 'success' | 'warning' | 'accent' {
    if (card.state === 'done') {
      return 'success';
    }
    return card.state === 'in_progress' ? 'warning' : 'accent';
  }
}
