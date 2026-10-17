import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { PendingReviewView } from '@lfd/contracts';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import type { ShopAudience } from '../catalogue.service';

/** Une validation demandée : des SKU, pour des audiences. */
export interface ReviewApproval {
  readonly skus: readonly string[];
  readonly audiences: readonly ShopAudience[];
}

/**
 * **L'encart des arrivées à valider** — en tête du « Catalogue publié » (lot 3
 * du plan `plan-catalogue-synchronise-par-audience.md`).
 *
 * Il ne liste plus les articles (Hugo, 2026-10-17) : chacun se valide sous sa
 * propre ligne, dans la table, avec les seuls boutons utiles. Il garde le
 * compte, un raccourci vers le filtre « En attente », et « Tout valider », qui
 * lève les deux audiences pour toute la liste — le serveur ignore une audience
 * qui n'attendait rien, sans refus. Pros et boutique restent deux décisions
 * (2026-10-15, option 2).
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

  /** Demande d'activer le filtre « En attente ». */
  readonly showPending = output();

  protected readonly title = computed(() => {
    const count = this.pending().length;
    return count > 1
      ? `${String(count)} nouveaux articles attendent votre validation`
      : '1 nouvel article attend votre validation';
  });

  protected approveAll(): void {
    this.approve.emit({
      skus: this.pending().map((entry) => entry.sku),
      audiences: ['pro', 'public'],
    });
  }
}
