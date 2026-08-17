import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { PricingComparisonItemView, PricingComparisonView } from '@lfd/contracts';
import { formatEuros } from '@lfd/catalog-ui';
import { FoldButtonComponent } from 'fold-ng';

import { TarificationService } from '../tarification.service';

/** Ce que la bande sait faire d'une variation : la dire, et la colorer. */
type Direction = 'up' | 'down' | 'flat';

const DAY_MS = 24 * 60 * 60 * 1000;

/** La fenêtre proposée à l'ouverture : le mois écoulé. */
const DEFAULT_DAYS = 30;

/**
 * **Deux marqueurs sur l'axe du temps**, et ce qui a bougé entre eux.
 *
 * Le prix de chaque article au premier instant, au second, l'écart — et en face,
 * le volume vendu sur la fenêtre qui les sépare, comparé à la fenêtre **miroir**
 * juste avant, de même durée. Les deux questions ne se répondent pas l'une sans
 * l'autre : une baisse de 15 % qui n'a pas fait bouger les quantités et une qui a
 * doublé les ventes sont deux décisions opposées, et le même chiffre de prix.
 *
 * **Ce que cette bande ne dit pas**, et l'en-tête l'écrit : le prix facturé ce
 * jour-là. Le tarif canonique vient du PIM au présent — il n'est pas historisé —
 * donc une lecture passée applique les décisions d'hier aux tarifs d'aujourd'hui.
 * La vérité de ce qui a été facturé vit sur les lignes de commande, figée à la
 * passation. Confondre les deux ferait contester une facture avec un écran.
 *
 * Aucun calcul ici : les écarts viennent du serveur, avec l'arithmétique qui
 * facture. La bande met en forme et trie.
 */
@Component({
  selector: 'app-comparison-band',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent],
  templateUrl: './comparison-band.html',
  styleUrl: './comparison-band.scss',
})
export class ComparisonBand {
  private readonly tarification = inject(TarificationService);

  protected readonly euros = formatEuros;

  protected readonly from = signal(isoDay(-DEFAULT_DAYS));
  protected readonly to = signal(isoDay(0));
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly result = signal<PricingComparisonView | null>(null);

  /**
   * Les articles **qui ont bougé**, du plus gros écart au plus petit.
   *
   * Le reste du catalogue est écarté : quatre-vingt-douze lignes dont trois
   * portent une information noieraient exactement ce qu'on est venu chercher.
   */
  protected readonly moved = computed<readonly PricingComparisonItemView[]>(() => {
    const items = this.result()?.items ?? [];
    return [...items]
      .filter((item) => item.fromCents !== item.toCents)
      .sort(
        (left, right) =>
          Math.abs(right.priceVariationBp ?? 0) - Math.abs(left.priceVariationBp ?? 0),
      );
  });

  protected readonly canRun = computed(
    () => this.from() !== '' && this.to() !== '' && this.from() < this.to(),
  );

  protected async run(): Promise<void> {
    if (!this.canRun() || this.loading()) {
      return;
    }
    this.loading.set(true);
    this.failed.set(false);
    try {
      this.result.set(await this.tarification.compare(instant(this.from()), instant(this.to())));
    } catch {
      this.failed.set(true);
      this.result.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  /** Une variation en clair. `null` reste `null` : on n'invente pas un « 0 % ». */
  protected percent(bp: number | null): string {
    if (bp === null) {
      return '—';
    }
    const value = Math.abs(bp / 100)
      .toFixed(1)
      .replace('.', ',');
    return `${bp > 0 ? '+' : bp < 0 ? '−' : ''}${value} %`;
  }

  protected direction(bp: number | null): Direction {
    if (bp === null || bp === 0) {
      return 'flat';
    }
    return bp > 0 ? 'up' : 'down';
  }
}

/** Un jour relatif à aujourd'hui, au format qu'attend un `<input type="date">`. */
function isoDay(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` → l'instant ISO du début de ce jour, en UTC comme tout le reste. */
function instant(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toISOString();
}
