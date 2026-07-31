import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { CommerceNav } from '../../commerce/commerce-nav/commerce-nav';
import { CommerceContextService } from '../../commerce/commerce-context.service';
import { formatEurValue } from '../../data/catalogue-seed';
import {
  basketItemCount,
  basketTotalEur,
  type Recurrence,
  RECURRENCE_LABELS,
  type SavedBasket,
  SavedBasketsService,
} from '../../data/saved-baskets.service';

/** Un panier prêt à lister : le modèle + ses totaux résolus. */
interface BasketCard {
  readonly basket: SavedBasket;
  readonly total: number;
  readonly count: number;
}

/**
 * Page **Mes paniers** — les **pré-configurations** de panier de l'établissement.
 * Chaque carte résume un panier (nom, récurrence, montant, nombre
 * d'utilisations) ; on clique pour l'ouvrir et l'éditer (quantités, ajout de
 * produits). « Nouveau panier » en crée un vide à composer.
 */
@Component({
  selector: 'app-saved-baskets-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    CommerceNav,
  ],
  templateUrl: './saved-baskets-page.html',
  styleUrl: './saved-baskets-page.scss',
})
export class SavedBasketsPage {
  private readonly saved = inject(SavedBasketsService);
  private readonly context = inject(CommerceContextService);
  private readonly router = inject(Router);

  protected readonly hasCompany = this.context.hasCompany;
  protected readonly selected = this.context.selected;

  protected readonly cards = computed<readonly BasketCard[]>(() => {
    const company = this.selected();
    if (company === null) {
      return [];
    }
    return this.saved.forCompany(company.id).map((basket) => ({
      basket,
      total: basketTotalEur(basket),
      count: basketItemCount(basket),
    }));
  });

  protected fmt(value: number): string {
    return formatEurValue(value);
  }

  protected recurrenceLabel(recurrence: Recurrence): string {
    return RECURRENCE_LABELS[recurrence];
  }

  protected open(basketId: string): void {
    void this.router.navigate(['/mes-paniers', basketId]);
  }

  /** Crée un panier vide et ouvre son éditeur pour le composer. */
  protected createNew(): void {
    const company = this.selected();
    if (company === null) {
      return;
    }
    const id = this.saved.create(company.id, 'Nouveau panier');
    void this.router.navigate(['/mes-paniers', id]);
  }
}
