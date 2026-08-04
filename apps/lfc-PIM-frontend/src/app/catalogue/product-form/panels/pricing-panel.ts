import {
  ChangeDetectionStrategy,
  Component,
  input,
  model,
  output,
} from '@angular/core';

import { FoldButtonComponent, FoldCardComponent } from 'fold-ng';

/** Panneau Tarif & logistique — prix canonique HT + poids de l'unité vendue. */
@Component({
  selector: 'app-pricing-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldButtonComponent],
  templateUrl: './pricing-panel.html',
  styleUrl: './panel.scss',
})
export class PricingPanel {
  readonly priceEur = model.required<number | null>();
  readonly weightGrams = model.required<number | null>();

  readonly saveable = input(false);
  readonly status = input('');
  readonly save = output<void>();

  protected numberValue(event: Event): number | null {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.value.trim() === '') {
      return null;
    }
    const parsed = Number(target.value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
