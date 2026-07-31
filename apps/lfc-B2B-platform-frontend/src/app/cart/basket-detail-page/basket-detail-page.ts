import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs/operators';

import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldNumberInputComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldSelectComponent,
} from 'fold-ng';

import type { FoldProduct } from '../../../shared';
import { FeaturedRail, type FeaturedItem } from '../../boutique/featured-rail/featured-rail';
import { CartService } from '../../data/cart.service';
import { formatEurValue, PRODUCTS } from '../../data/catalogue-seed';
import {
  basketItemCount,
  basketTotalEur,
  type Recurrence,
  RECURRENCE_LABELS,
  resolveBasketLines,
  type SavedBasket,
  SavedBasketsService,
} from '../../data/saved-baskets.service';

/** Combien de suggestions au maximum dans le carrousel. */
const MAX_SUGGESTIONS = 8;

/**
 * Page **détail d'un panier enregistré** — l'éditeur : les lignes en rangs
 * (ajustement des quantités, retrait), l'ajout de produits via un carrousel de
 * **suggestions**, le nom et la **récurrence**. « Recommander » reverse le panier
 * dans le panier actif et incrémente le compteur d'utilisations.
 */
@Component({
  selector: 'app-basket-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldNumberInputComponent,
    FoldSelectComponent,
    FoldCalloutComponent,
    FeaturedRail,
  ],
  templateUrl: './basket-detail-page.html',
  styleUrl: './basket-detail-page.scss',
})
export class BasketDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly saved = inject(SavedBasketsService);
  private readonly cart = inject(CartService);

  private readonly basketId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('id') ?? '')),
    { initialValue: '' },
  );

  protected readonly basket = computed<SavedBasket | null>(
    () => this.saved.byId(this.basketId()) ?? null,
  );

  protected readonly lines = computed(() => {
    const basket = this.basket();
    return basket === null ? [] : resolveBasketLines(basket);
  });

  protected readonly total = computed(() => {
    const basket = this.basket();
    return basket === null ? 0 : basketTotalEur(basket);
  });

  protected readonly count = computed(() => {
    const basket = this.basket();
    return basket === null ? 0 : basketItemCount(basket);
  });

  protected readonly recurrenceOptions = (
    ['none', 'weekly', 'biweekly', 'monthly'] as const
  ).map((value) => ({ value, label: RECURRENCE_LABELS[value] }));

  /** Suggestions : produits absents du panier, tirés du catalogue. */
  protected readonly suggestions = computed<readonly FeaturedItem[]>(() => {
    const basket = this.basket();
    if (basket === null) {
      return [];
    }
    const present = new Set(basket.lines.map((line) => line.sku));
    const items: FeaturedItem[] = [];
    for (const product of PRODUCTS) {
      if (items.length >= MAX_SUGGESTIONS) {
        break;
      }
      if (!present.has(product.id)) {
        items.push({ product, flag: 'À ajouter', highlight: false });
      }
    }
    return items;
  });

  protected fmt(value: number): string {
    return formatEurValue(value);
  }

  /** Lit la valeur d'un `<input>` natif sans caster en `any`. */
  private inputValue(event: Event): string {
    const el = event.target;
    return el instanceof HTMLInputElement ? el.value : '';
  }

  protected onQty(sku: string, value: number | null): void {
    const basket = this.basket();
    if (basket !== null) {
      this.saved.setQty(basket.id, sku, value ?? 0);
    }
  }

  protected removeLine(sku: string): void {
    const basket = this.basket();
    if (basket !== null) {
      this.saved.setQty(basket.id, sku, 0);
    }
  }

  protected addProduct(product: FoldProduct): void {
    const basket = this.basket();
    if (basket !== null) {
      this.saved.addProduct(basket.id, product.id);
    }
  }

  protected onName(event: Event): void {
    const basket = this.basket();
    if (basket !== null) {
      this.saved.rename(basket.id, this.inputValue(event));
    }
  }

  protected onRecurrence(value: string): void {
    const basket = this.basket();
    if (basket !== null) {
      this.saved.setRecurrence(basket.id, value as Recurrence, basket.nextDate);
    }
  }

  protected onDate(event: Event): void {
    const basket = this.basket();
    if (basket !== null) {
      const value = this.inputValue(event);
      this.saved.setRecurrence(basket.id, basket.recurrence, value === '' ? null : value);
    }
  }

  /** Reverse le panier dans le panier actif, compte l'utilisation, va au panier. */
  protected recommander(): void {
    const basket = this.basket();
    if (basket === null) {
      return;
    }
    for (const line of basket.lines) {
      this.cart.add(line.sku, line.qty);
    }
    this.saved.markUsed(basket.id);
    void this.router.navigate(['/panier']);
  }

  protected remove(): void {
    const basket = this.basket();
    if (basket !== null) {
      this.saved.remove(basket.id);
    }
    void this.router.navigate(['/mes-paniers']);
  }

  protected back(): void {
    void this.router.navigate(['/mes-paniers']);
  }
}
