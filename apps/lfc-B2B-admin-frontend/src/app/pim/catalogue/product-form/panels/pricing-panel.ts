import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { FoldButtonComponent, FoldCardComponent } from 'fold-ng';

import { ProductFormStore } from '../product-form-store';
import { numberValue } from './dom';

/** Panneau Tarif & logistique — prix canonique HT + poids de l'unité vendue. */
@Component({
  selector: 'app-pricing-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldButtonComponent],
  templateUrl: './pricing-panel.html',
  styleUrl: './panel.scss',
})
export class PricingPanel {
  protected readonly store = inject(ProductFormStore);
  protected readonly numberValue = numberValue;
}
