import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { ResupplyArticleView } from '@lfd/contracts';
import { FoldButtonComponent, FoldNumberInputComponent, FoldPanelHostService } from 'fold-ng';

import {
  QuantityDialog,
  type QuantityDialogData,
} from '../../../shared/quantity-dialog/quantity-dialog';
import {
  quantityDownStepsFor,
  quantityStepsFor,
} from '../../../shared/quantity-steps/quantity-steps';
import { SaleQuantityPipe } from '../../../shared/sale-quantity/sale-quantity.pipe';

/**
 * **La case de quantité d'un article** dans « Envoyer un réassort » : la
 * case, et ses pas rapides de part et d'autre — on retire à gauche, on
 * ajoute à droite (Hugo, 2026-10-28). En mobile, la case seule, en lecture :
 * la toucher ouvre le dialogue qui porte les raccourcis.
 *
 * Elle ne garde rien : la carte tient les quantités, la case lui dit la
 * nouvelle valeur.
 */
@Component({
  selector: 'app-bakehouse-quantity-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldNumberInputComponent, SaleQuantityPipe],
  templateUrl: './bakehouse-quantity-stepper.html',
  styleUrl: './bakehouse-quantity-stepper.scss',
})
export class BakehouseQuantityStepper {
  private readonly panels = inject(FoldPanelHostService);

  readonly article = input.required<ResupplyArticleView>();
  /** La quantité saisie ; `null` : l'article n'est pas demandé. */
  readonly quantity = input.required<number | null>();
  readonly phone = input(false);
  readonly quantityChange = output<number | null>();

  /** Au poids, la case compte des grammes : ses pas aussi (lot L2b-4). */
  protected readonly upSteps = computed(() => quantityStepsFor(this.article().saleUnit));
  protected readonly downSteps = computed(() => quantityDownStepsFor(this.article().saleUnit));

  /** Un pas rapide : positif ajoute, négatif retire, sans descendre sous zéro. */
  step(delta: number): void {
    this.quantityChange.emit(Math.max(0, (this.quantity() ?? 0) + delta));
  }

  /** En mobile, la case ouvre le dialogue du chiffre et des raccourcis. */
  protected async openDialog(): Promise<void> {
    if (!this.phone()) {
      return;
    }
    const article = this.article();
    const quantity = await this.panels.open<QuantityDialogData, number>(QuantityDialog, {
      data: { label: article.name, quantity: this.quantity(), saleUnit: article.saleUnit },
    }).closed;
    if (quantity !== undefined) {
      this.quantityChange.emit(quantity);
    }
  }
}
