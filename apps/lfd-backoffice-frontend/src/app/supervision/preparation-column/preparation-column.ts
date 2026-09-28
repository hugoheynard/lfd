import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import type { WorkshopLine } from '@lfd/contracts';
import { RouterLink } from '@angular/router';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldMeterComponent,
} from 'fold-ng';

import {
  ALL_SHELVES,
  filterShelves,
  type LineProgress,
  lineProgressOf,
  type PreparationBoard,
  type ShelfCard,
} from '../preparation-shelves';
import {
  type CheckSummary,
  checkSummary,
  NO_QUALITY,
  type QualityBadge,
  type QualityRequest,
} from '../quality-badges';
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
  /** Ceux dont l'absence a fait dépasser un créneau par nous : bord rouge. */
  readonly lateSkus = input<ReadonlySet<string>>(new Set());
  readonly quality = input(NO_QUALITY);
  /** `b2b_supervision:write` : le bouton « Contrôler ». */
  readonly canCheck = input(false);
  readonly check = output<QualityRequest>();

  /**
   * Le rayon retenu par la bande « Tous les rayons ▾ » (A4). État propre à la
   * colonne ; la bande, projetée dans l'en-tête, le partage en `[(shelfFilter)]`.
   */
  readonly shelfFilter = model<string>(ALL_SHELVES);

  protected readonly link = SUPERVISION_LINKS.preparation;
  protected readonly empty = computed(
    () => this.board().open.length === 0 && this.board().finished.length === 0,
  );

  /** Ce qui reste au four, dans l'ordre du serveur : en cours, puis pas commencés. */
  protected readonly openCards = computed(() =>
    filterShelves(this.board().open, this.shelfFilter()),
  );
  /** Les rayons finis, en bas, sous « Terminés ». */
  protected readonly doneCards = computed(() =>
    filterShelves(this.board().finished, this.shelfFilter()),
  );
  /** Une seule suite de cartes : le séparateur « Terminés » se pose à la première finie. */
  protected readonly shown = computed<readonly ShelfCard[]>(() => [
    ...this.openCards(),
    ...this.doneCards(),
  ]);

  /**
   * Les rayons finis que l'on a rouverts. **Repliés par défaut** (Hugo,
   * 2026-09-28, Supervision v2 A6) : l'en-tête seul, qui dit son contrôle.
   */
  private readonly unfolded = signal<ReadonlySet<string>>(new Set());

  /** Mode `products` (A5) : on suit des produits attendus, le reste recule. */
  protected readonly awaiting = computed(() => this.matches().mode === 'products');

  /** Le rayon porte-t-il une occurrence de la mise en avant ? */
  protected shelfMatches(card: ShelfCard): boolean {
    const skus = this.matches().skus;
    return [...card.pending, ...card.done].some((line) => skus.has(line.sku));
  }

  /** Un rayon fini s'ouvre à la demande — ou de lui-même s'il porte une occurrence. */
  protected isUnfolded(card: ShelfCard): boolean {
    return this.unfolded().has(card.key) || this.shelfMatches(card);
  }

  protected setUnfolded(key: string, open: boolean): void {
    const next = new Set(this.unfolded());
    if (open) {
      next.add(key);
    } else {
      next.delete(key);
    }
    this.unfolded.set(next);
  }

  protected isHit(sku: string): boolean {
    return this.matches().skus.has(sku);
  }

  /** « Attendu · Chalet Marmotte, Traiteur Vermeil » — `null` hors mode produits. */
  protected awaitedLabel(sku: string): string | null {
    if (!this.awaiting()) {
      return null;
    }
    const names = this.matches().awaitedBy.get(sku) ?? [];
    return names.length === 0 ? null : `Attendu · ${names.join(', ')}`;
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

  /** « Contrôle 1/3 · OK » — ce que dit l'en-tête d'un rayon fini replié. */
  protected shelfSummary(card: ShelfCard): CheckSummary {
    return checkSummary(
      this.linesOf(card).map(({ line }) => this.lineBadge(line)),
      card.lineCount,
    );
  }

  protected requestCheck(line: WorkshopLine): void {
    this.check.emit({
      target: { kind: 'line', sku: line.sku },
      title: line.productName,
      subtitle: `${countLabel(line.quantity, 'pièce', 'pièces')} au compte`,
    });
  }

  protected meterLabel(card: ShelfCard): string {
    return `${String(card.remainingUnits)} pièces restantes`;
  }

  protected meterTone(card: ShelfCard): 'warning' | 'accent' {
    return card.state === 'in_progress' ? 'warning' : 'accent';
  }
}
