import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { FoldButtonComponent, FoldCalloutComponent, FoldCheckboxComponent } from 'fold-ng';

import type { AllergenScope } from '../../../../data/models';
import type { NutritionValues } from '../../../product-http-api';
import { ProductFormStore } from '../../product-form-store';
import { numberValue } from '../dom';

const SCOPES: readonly { value: AllergenScope; label: string }[] = [
  { value: 'eu', label: 'UE / France' },
  { value: 'world', label: 'Monde' },
];

const NUTRITION_FIELDS: readonly { key: keyof NutritionValues; label: string }[] = [
  { key: 'energyKcal', label: 'Calories (kcal)' },
  { key: 'carbsG', label: 'Glucides (g)' },
  { key: 'fatG', label: 'Lipides (g)' },
  { key: 'proteinG', label: 'Protéines (g)' },
  { key: 'glycemicIndex', label: 'Indice glycémique' },
];

/** Panneau Allergènes & nutrition — **une** fiche réglementaire (un seul save). */
@Component({
  selector: 'app-regulatory-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, FoldCheckboxComponent],
  templateUrl: './regulatory-form.html',
  styleUrls: ['../form-section.scss', './regulatory-form.scss'],
})
export class RegulatoryForm {
  protected readonly store = inject(ProductFormStore);
  protected readonly numberValue = numberValue;
  protected readonly scopes = SCOPES;
  protected readonly nutritionFields = NUTRITION_FIELDS;
}
