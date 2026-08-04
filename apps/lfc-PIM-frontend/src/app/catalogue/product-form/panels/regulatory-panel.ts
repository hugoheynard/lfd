import {
  ChangeDetectionStrategy,
  Component,
  input,
  model,
  output,
} from '@angular/core';

import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
} from 'fold-ng';

import type { AllergenEntry, AllergenScope } from '../../../data/models';
import type { NutritionValues } from '../../product-http-api';

export interface AllergenGroup {
  readonly incoLabel: string;
  readonly entries: readonly AllergenEntry[];
}

const SCOPES: readonly { value: AllergenScope; label: string }[] = [
  { value: 'eu', label: 'UE / France' },
  { value: 'world', label: 'Monde' },
];

const NUTRITION_FIELDS: readonly { key: keyof NutritionValues; label: string }[] =
  [
    { key: 'energyKcal', label: 'Calories (kcal)' },
    { key: 'carbsG', label: 'Glucides (g)' },
    { key: 'fatG', label: 'Lipides (g)' },
    { key: 'proteinG', label: 'Protéines (g)' },
    { key: 'glycemicIndex', label: 'Indice glycémique' },
  ];

/** Panneau Allergènes & nutrition — **une** fiche réglementaire (un seul save,
 *  car le backend remplace la déclaration entière). */
@Component({
  selector: 'app-regulatory-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
  ],
  templateUrl: './regulatory-panel.html',
  styleUrl: './panel.scss',
})
export class RegulatoryPanel {
  readonly declaresNone = model.required<boolean>();
  readonly selected = model.required<string[]>();
  readonly nutrition = model.required<NutritionValues>();

  readonly scope = input.required<AllergenScope>();
  readonly groups = input.required<readonly AllergenGroup[]>();
  readonly provisional = input(false);
  readonly saveable = input(false);
  readonly status = input('');
  readonly scopeChange = output<AllergenScope>();
  readonly save = output<void>();

  protected readonly scopes = SCOPES;
  protected readonly nutritionFields = NUTRITION_FIELDS;

  protected declaresSomething(): boolean {
    return this.declaresNone() || this.selected().length > 0;
  }

  protected nutritionValue(key: keyof NutritionValues): number | null {
    return this.nutrition()[key];
  }

  protected numberValue(event: Event): number | null {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.value.trim() === '') {
      return null;
    }
    const parsed = Number(target.value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  protected setNutrition(key: keyof NutritionValues, value: number | null): void {
    this.nutrition.update((current) => ({ ...current, [key]: value }));
  }

  protected toggle(code: string, on: boolean): void {
    this.selected.update((current) =>
      on ? [...current, code] : current.filter((entry) => entry !== code),
    );
  }

  protected toggleNone(on: boolean): void {
    this.declaresNone.set(on);
    if (on) {
      this.selected.set([]);
    }
  }
}
