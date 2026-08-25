import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldFieldsetComponent,
  FoldNumberInputComponent,
} from 'fold-ng';

import type { AllergenScope } from '../../../../data/models';
import type { NutritionValues } from '../../../product-http-api';
import { ProductFormStore } from '../../product-form-store';

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

/**
 * Panneau Allergènes & nutrition — **une** fiche réglementaire (un seul save).
 *
 * Les six nombres passent par `fold-number-input`, plus par un `<input
 * type="number">` nu. Ce n'est pas cosmétique : ce contrôle porte
 * `number | null`, donc **le vide est une valeur** — un champ effacé rend
 * `null`, pas `0` ni `NaN`. Un poids net à zéro et un poids net inconnu ne se
 * déclarent pas pareil, et c'est le genre de distinction qu'une coercion
 * maison perd un jour sans prévenir.
 *
 * `numberValue` (`../dom`) reste pour le champ **prix** de « Tarif & TVA », qui
 * n'a pas encore été repris — la fonction n'est pas morte, elle a un usage de
 * moins.
 */
@Component({
  selector: 'app-regulatory-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldFieldsetComponent,
    FoldNumberInputComponent,
  ],
  templateUrl: './regulatory-form.html',
  styleUrls: ['../form-section.scss', './regulatory-form.scss'],
})
export class RegulatoryForm {
  protected readonly store = inject(ProductFormStore);
  protected readonly scopes = SCOPES;
  protected readonly nutritionFields = NUTRITION_FIELDS;
}
