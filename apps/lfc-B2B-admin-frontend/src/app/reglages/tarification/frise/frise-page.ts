import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type {
  PricingBoardView,
  PricingComparisonItemView,
  PricingComparisonView,
} from '@lfd/contracts';
import { formatEuros } from '@lfd/catalog-ui';
import { FoldButtonComponent, FoldEmptyStateComponent } from 'fold-ng';

import { dayStart } from './axis-model';
import { TarificationService } from '../tarification.service';
import { TimelineAxis, type AxisBand, type AxisSelection } from './timeline-axis/timeline-axis';

/** Une ligne du catalogue à un instant — le prix, et les paliers s'il y en a. */
interface SnapshotRow {
  readonly sku: string;
  readonly name: string;
  readonly categoryName: string;
  readonly finalCents: number;
  readonly tiers: readonly { readonly minQuantity: number; readonly unitPriceCents: number }[];
}

/**
 * **La frise, et ce qu'on lit dessous.**
 *
 * Un axe horizontal, les décisions en barres, et des marqueurs qu'on pose à la
 * main. Un marqueur : le catalogue tel qu'il était ce jour-là, prix par article
 * et paliers de volume quand il y en a. Un glissement : deux catalogues, et
 * entre eux ce qui a bougé — l'écart de prix, et le volume vendu sur la période.
 *
 * **Ce que cette vue dit, et ce qu'elle ne dit pas.** Elle montre les DÉCISIONS
 * en vigueur à une date, pas le prix facturé ce jour-là : le tarif canonique
 * vient du PIM au présent, il n'est pas historisé. La vérité de la facture est
 * figée sur la ligne de commande, et nulle part ailleurs. L'en-tête l'écrit,
 * parce qu'un écran qui laisse croire l'inverse finit par servir d'argument dans
 * un litige.
 *
 * Aucun prix n'est calculé ici : chaque lecture datée passe par la fonction qui
 * facture, côté serveur. La page place, groupe et met en forme.
 */
@Component({
  selector: 'app-frise-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FoldButtonComponent, FoldEmptyStateComponent, TimelineAxis],
  templateUrl: './frise-page.html',
  styleUrl: './frise-page.scss',
})
export class FrisePage {
  private readonly tarification = inject(TarificationService);

  protected readonly euros = formatEuros;

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly selection = signal<AxisSelection | null>(null);
  protected readonly reading = signal(false);

  /** Le tableau d'aujourd'hui : il donne les barres de l'axe, rien de plus. */
  private readonly board = signal<PricingBoardView | null>(null);
  private readonly snapshot = signal<PricingBoardView | null>(null);
  protected readonly comparison = signal<PricingComparisonView | null>(null);

  constructor() {
    void this.load();
  }

  /**
   * **Les barres de l'axe** : les règles du catalogue, celles des familles, et
   * les barèmes. Toutes les décisions, sur un axe commun — c'est ce qu'on vise
   * quand on pose un marqueur « juste avant la promo de rentrée ».
   */
  protected readonly bands = computed<readonly AxisBand[]>(() => {
    const board = this.board();
    if (board === null) {
      return [];
    }
    const rules = [
      ...board.globalRules,
      ...board.categories.flatMap((category) => category.rules),
    ].map((rule) => ({
      id: rule.id,
      label: rule.label,
      validFrom: rule.validFrom,
      validTo: rule.validTo,
    }));
    const ladders = board.categories
      .flatMap((category) => category.ladders)
      .map((ladder) => ({
        id: ladder.id,
        label: ladder.label,
        validFrom: ladder.validFrom,
        validTo: ladder.validTo,
      }));
    return dedupe([...rules, ...ladders]);
  });

  /** Le catalogue au marqueur unique — vide dès qu'une zone est ouverte. */
  protected readonly rows = computed<readonly SnapshotRow[]>(() => {
    const board = this.snapshot();
    if (board === null) {
      return [];
    }
    return board.categories.flatMap((category) =>
      category.items.map((item) => ({
        sku: item.sku,
        name: item.name,
        categoryName: category.name,
        finalCents: item.finalCents,
        tiers: (item.volumeTiers ?? []).map((tier) => ({
          minQuantity: tier.minQuantity,
          unitPriceCents: tier.unitPriceCents,
        })),
      })),
    );
  });

  /** Les articles qui ont bougé entre les deux marqueurs, du plus gros écart au plus petit. */
  protected readonly moved = computed<readonly PricingComparisonItemView[]>(() => {
    const items = this.comparison()?.items ?? [];
    return [...items]
      .filter((item) => item.fromCents !== item.toCents)
      .sort(
        (left, right) =>
          Math.abs(right.priceVariationBp ?? 0) - Math.abs(left.priceVariationBp ?? 0),
      );
  });

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.board.set(await this.tarification.read());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /**
   * Le geste de l'axe, lu une fois : un marqueur mène à une lecture datée, une
   * zone à une comparaison. Les deux ne coexistent jamais à l'écran — l'ancienne
   * réponse est effacée avant que la nouvelle parte, sinon on lirait le
   * catalogue d'un marqueur avec les écarts d'un autre.
   */
  protected async onSelected(selection: AxisSelection): Promise<void> {
    this.selection.set(selection);
    this.snapshot.set(null);
    this.comparison.set(null);
    this.reading.set(true);
    try {
      if (selection.kind === 'instant') {
        this.snapshot.set(await this.tarification.read(dayStart(selection.day)));
      } else {
        this.comparison.set(
          await this.tarification.compare(dayStart(selection.from), dayStart(selection.to)),
        );
      }
    } catch {
      this.snapshot.set(null);
      this.comparison.set(null);
    } finally {
      this.reading.set(false);
    }
  }

  /** Les champs de date de l'en-tête pilotent la même sélection que l'axe. */
  protected setDay(which: 'from' | 'to', day: string): void {
    if (day === '') {
      return;
    }
    const current = this.selection();
    const other =
      current === null
        ? null
        : current.kind === 'instant'
          ? current.day
          : current[which === 'from' ? 'to' : 'from'];
    if (other === null || current === null || current.kind === 'instant') {
      void this.onSelected({ kind: 'instant', day });
      return;
    }
    const [from, to] = which === 'from' ? [day, current.to] : [current.from, day];
    void this.onSelected(from < to ? { kind: 'zone', from, to } : { kind: 'instant', day });
  }

  protected dayOf(which: 'from' | 'to'): string {
    const selection = this.selection();
    if (selection === null) {
      return '';
    }
    return selection.kind === 'instant'
      ? which === 'from'
        ? selection.day
        : ''
      : selection[which];
  }

  /** Une variation en clair. `—` quand elle ne se calcule pas : on n'invente pas un zéro. */
  protected percent(bp: number | null): string {
    if (bp === null) {
      return '—';
    }
    const value = Math.abs(bp / 100)
      .toFixed(1)
      .replace('.', ',');
    return `${bp > 0 ? '+' : bp < 0 ? '−' : ''}${value} %`;
  }

  protected direction(bp: number | null): 'up' | 'down' | 'flat' {
    if (bp === null || bp === 0) {
      return 'flat';
    }
    return bp > 0 ? 'up' : 'down';
  }
}

/** Une même décision ne se dessine qu'une fois, même vue de deux familles. */
function dedupe(bands: readonly AxisBand[]): AxisBand[] {
  return [...new Map(bands.map((band) => [band.id, band])).values()];
}
