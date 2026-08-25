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

interface NutritionField {
  readonly key: keyof NutritionValues;
  readonly label: string;
}

/**
 * La grille, **par lignes**, dans l'ordre de l'annexe XV du règlement UE
 * 1169/2011 — celui que le tableau imprimé doit suivre.
 *
 * Chaque ligne appaire ce qui se lit ensemble : une valeur et sa part
 * (« Lipides » / « dont acides gras saturés »), ou deux valeurs voisines. Une
 * grille à plat les laissait se répartir au gré de la largeur, si bien que
 * « dont sucres » pouvait se retrouver sous « Protéines » — un « dont » qui ne
 * touche plus ce dont il est la part ne veut plus rien dire.
 *
 * L'indice glycémique n'est PAS de l'annexe XV : c'est un renseignement
 * produit. Il tient la place libre de la première ligne plutôt que d'ouvrir une
 * ligne à lui seul, mais son libellé ne porte aucune unité de la déclaration.
 */
interface NutritionRow {
  /** La ligne se suit par son PREMIER champ — nommé, pas déduit d'un index. */
  readonly key: keyof NutritionValues;
  readonly fields: readonly NutritionField[];
}

const NUTRITION_ROWS: readonly NutritionRow[] = [
  {
    key: 'energyKcal',
    fields: [
      { key: 'energyKcal', label: 'Calories (kcal)' },
      { key: 'glycemicIndex', label: 'Indice glycémique' },
    ],
  },
  {
    key: 'fatG',
    fields: [
      { key: 'fatG', label: 'Lipides (g)' },
      { key: 'saturatedFatG', label: 'dont acides gras saturés (g)' },
    ],
  },
  {
    key: 'carbsG',
    fields: [
      { key: 'carbsG', label: 'Glucides (g)' },
      { key: 'sugarsG', label: 'dont sucres (g)' },
    ],
  },
  {
    key: 'proteinG',
    fields: [
      { key: 'proteinG', label: 'Protéines (g)' },
      { key: 'saltG', label: 'Sel (g)' },
    ],
  },
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
  protected readonly nutritionRows = NUTRITION_ROWS;
}
