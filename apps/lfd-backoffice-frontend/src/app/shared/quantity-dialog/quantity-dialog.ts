import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import type { OrderSaleUnit } from '@lfd/contracts';
import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';
import {
  FoldButtonComponent,
  FoldNumberInputComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelDefaults,
} from 'fold-ng';

import { SaleQuantityPipe } from '../sale-quantity/sale-quantity.pipe';
import { quantityDownStepsFor, quantityStepsFor } from '../quantity-steps/quantity-steps';

/** Ce qu'on règle : le nom de l'article, et la quantité déjà saisie. */
export interface QuantityDialogData {
  readonly label: string;
  readonly quantity: number | null;
  /**
   * Au poids (lot L2b-4), la quantité est en GRAMMES : saisie en grammes,
   * relue « 1,25 kg », avec des pas en grammes. Absente = des pièces.
   */
  readonly saleUnit?: OrderSaleUnit | undefined;
}

/**
 * **La quantité d'un article, en mobile** (Hugo, 2026-10-28) : sur un
 * téléphone, la ligne ne montre que sa case ; la toucher ouvre ce dialogue,
 * qui porte le chiffre et les raccourcis que la largeur ne laisse pas sur la
 * ligne. Rend la quantité validée (`0` retire l'article), rien si l'on ferme.
 */
@Component({
  selector: 'app-quantity-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldNumberInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
    SaleQuantityPipe,
  ],
  templateUrl: './quantity-dialog.html',
  styleUrl: './quantity-dialog.scss',
})
export class QuantityDialog {
  static readonly foldPanel: FoldPanelDefaults = { side: 'bottom' };

  private readonly ref = inject<FoldPanelRef<number>>(FoldPanelRef);
  readonly data = input.required<QuantityDialogData>();

  protected readonly weighed = computed(() => this.data().saleUnit === 'weight');
  /** Les pas de part et d'autre du chiffre — les mêmes que la table au bureau, en grammes au poids. */
  protected readonly steps = computed(() => quantityStepsFor(this.data().saleUnit));
  protected readonly downSteps = computed(() => quantityDownStepsFor(this.data().saleUnit));
  protected readonly draft = linkedSignal(() => this.data().quantity);
  protected readonly empty = computed(() => (this.draft() ?? 0) === 0);
  /** Au poids, la saisie en grammes relue en kilos sous la case. */
  protected readonly hint = computed(() => {
    const grams = this.draft();
    return this.weighed() && grams !== null && Number.isSafeInteger(grams) && grams > 0
      ? saleQuantityLabel(grams, 'weight')
      : undefined;
  });

  /** Un pas : positif ajoute, négatif retire, sans descendre sous zéro. */
  protected step(delta: number): void {
    this.draft.set(Math.max(0, (this.draft() ?? 0) + delta));
  }

  protected submit(): void {
    this.ref.close(Math.max(0, this.draft() ?? 0));
  }

  protected cancel(): void {
    this.ref.close();
  }
}
