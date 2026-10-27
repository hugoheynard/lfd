import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { httpErrorMessage } from '@lfd/endpoints';
import type {
  IngredientAllergenPropagationView,
  ProductAllergenPropagationView,
} from '@lfd/pim-contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelDefaults,
} from 'fold-ng';

import {
  appliedProductCount,
  blockedReason,
  publishedLoses,
  type AllergenLabeler,
} from '../allergen-propagation';
import { IngredientHttpApi } from '../ingredient-http-api';

/** Charge du panneau : l'aperçu à détailler, et de quoi nommer les codes. */
export interface IngredientPropagationPanelData {
  readonly view: IngredientAllergenPropagationView;
  readonly labelOf: AllergenLabeler;
}

/**
 * **Les fiches touchées** par la propagation d'un allergène d'ingrédient —
 * fiche par fiche, déclinaison par déclinaison, avec la case de chaque retrait
 * (cochée par défaut, plan § 2) et l'application.
 *
 * Se ferme sur le NOMBRE de fiches appliquées, tiré de l'aperçu confirmé : la
 * route rend l'aperçu RELU, qui ne dit plus ce qui vient de changer.
 */
@Component({
  selector: 'app-ingredient-propagation-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldPanelHeaderComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldBadgeComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldButtonComponent,
  ],
  templateUrl: './ingredient-propagation-panel.html',
  styleUrl: './ingredient-propagation-panel.scss',
})
export class IngredientPropagationPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'right', width: 'lg' };

  private readonly api = inject(IngredientHttpApi);
  private readonly ref = inject(FoldPanelRef);

  readonly data = input<IngredientPropagationPanelData | undefined>(undefined);

  protected readonly view = computed(() => this.data()?.view);
  /** Les déclinaisons dont la case de retrait est DÉCOCHÉE. */
  protected readonly kept = signal<ReadonlySet<string>>(new Set());
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly count = computed(() => {
    const view = this.view();
    return view === undefined ? 0 : appliedProductCount(view, this.kept());
  });

  protected readonly applyLabel = computed(() =>
    this.count() === 1 ? 'Appliquer à 1 fiche' : `Appliquer à ${String(this.count())} fiches`,
  );

  protected readonly heading = computed(
    () => `Fiches qui citent ${this.view()?.ingredientName ?? ''}`,
  );

  protected labels(codes: readonly string[]): string {
    const labelOf = this.data()?.labelOf ?? ((code: string) => code);
    return codes.map(labelOf).join(', ');
  }

  protected label(code: string): string {
    return (this.data()?.labelOf ?? ((value: string) => value))(code);
  }

  protected reason = blockedReason;

  protected isKept(variantId: string): boolean {
    return this.kept().has(variantId);
  }

  protected losesRed(product: ProductAllergenPropagationView): boolean {
    return publishedLoses(product, this.kept());
  }

  protected statusLabel(product: ProductAllergenPropagationView): string {
    return product.status === 'published' ? 'Publiée' : 'Brouillon';
  }

  /** Cochée = retirer ; décochée = l'allergène est voulu sur cette déclinaison. */
  protected toggleRemoval(variantId: string, remove: boolean): void {
    this.kept.update((current) => {
      const next = new Set(current);
      if (remove) {
        next.delete(variantId);
      } else {
        next.add(variantId);
      }
      return next;
    });
  }

  protected cancel(): void {
    this.ref.close();
  }

  /** Un refus reste dans le panneau, qui reste ouvert ; un succès ferme sur N. */
  protected async apply(): Promise<void> {
    const view = this.view();
    if (view === undefined || this.count() === 0) {
      return;
    }
    const applied = this.count();
    const kept = [...this.kept()];
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.applyAllergenPropagation(view.ingredientKey, {
        added: [...view.added],
        removed: [...view.removed],
        ...(kept.length === 0 ? {} : { removalsKept: kept }),
      });
      this.ref.close(applied);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, 'La propagation a été refusée.'));
    } finally {
      this.busy.set(false);
    }
  }
}
