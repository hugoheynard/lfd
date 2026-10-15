import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { PendingReviewView } from '@lfd/contracts';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import type { ShopAudience } from '../catalogue.service';

/** Une validation demandée : des SKU, pour des audiences. */
export interface ReviewApproval {
  readonly skus: readonly string[];
  readonly audiences: readonly ShopAudience[];
}

/** Le bouton d'une audience, dans les mots du staff. */
const APPROVE_LABEL: Readonly<Record<ShopAudience, string>> = {
  pro: 'Valider pour les pros',
  public: 'Valider pour la boutique',
};

/**
 * **Les articles arrivés du référentiel qui attendent une validation** — le
 * callout en tête du « Catalogue publié » (lot 3 du plan
 * `plan-catalogue-synchronise-par-audience.md`).
 *
 * Pros et public se valident séparément (Hugo, 2026-10-15, option 2) : chaque
 * ligne offre un bouton par audience qui l'attend, et « Tout valider » lève
 * les deux pour toute la liste — le serveur ignore une audience qui n'attendait
 * rien, sans refus.
 *
 * Un `fold-callout` en ligne, pas une page : c'est un échec partiel de la
 * vente (des articles reçus que personne ne voit encore), et le catalogue
 * reste à l'écran dessous.
 */
@Component({
  selector: 'app-review-callout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent],
  templateUrl: './review-callout.html',
  styleUrl: './review-callout.scss',
})
export class ReviewCallout {
  readonly pending = input.required<readonly PendingReviewView[]>();
  readonly busy = input(false);

  readonly approve = output<ReviewApproval>();

  protected readonly title = computed(() => {
    const count = this.pending().length;
    return count > 1
      ? `${String(count)} nouveaux articles attendent votre validation`
      : '1 nouvel article attend votre validation';
  });

  protected label(audience: ShopAudience): string {
    return APPROVE_LABEL[audience];
  }

  protected approveOne(entry: PendingReviewView, audience: ShopAudience): void {
    this.approve.emit({ skus: [entry.sku], audiences: [audience] });
  }

  protected approveAll(): void {
    this.approve.emit({
      skus: this.pending().map((entry) => entry.sku),
      audiences: ['pro', 'public'],
    });
  }
}
