import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { FoldCalloutComponent, FoldFieldsetComponent, FoldNumberInputComponent } from 'fold-ng';

import type { NutritionValues } from '../../../product-http-api';
import { ProductFormStore } from '../../product-form-store';

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
 * ⚠️ **Sept valeurs, pas huit** : l'indice glycémique n'est PAS de l'annexe XV,
 * c'est un renseignement produit. Il tient la place libre de la première ligne
 * plutôt que d'ouvrir une ligne à lui seul, mais son libellé ne porte aucune
 * unité de la déclaration.
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
 * Panneau **Valeurs nutritionnelles** — la grille pour 100 g et le poids net.
 *
 * 🔴 Séparé des allergènes le 2026-09-22 (plan
 * `plan-separer-allergenes-et-nutrition.md`). Deux conséquences que l'écran doit
 * porter, et qui ne sont pas cosmétiques :
 *
 * - **il n'envoie aucun code d'allergène**, et la route les refuse (400). Une
 *   valeur saisie ici ne peut plus effacer une déclaration de sécurité ;
 * - **il n'est pas exigé pour publier** (D2). Le règlement exempte la
 *   déclaration nutritionnelle de ce qu'on vend — art. 44 §1 pour le frais non
 *   préemballé en boutique, annexe V pt 19 pour les confiseries — là où il
 *   n'exempte les allergènes par aucune des deux bases. L'écran le dit au lieu
 *   de le laisser deviner.
 *
 * Les nombres passent par `fold-number-input`, qui porte `number | null` : un
 * champ effacé rend `null`, pas `0` ni `NaN`. Un sel à zéro et un sel inconnu ne
 * se déclarent pas pareil, et c'est le genre de distinction qu'une coercion
 * maison perd un jour sans prévenir.
 */
@Component({
  selector: 'app-nutrition-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldFieldsetComponent, FoldNumberInputComponent],
  templateUrl: './nutrition-form.html',
  styleUrls: ['../form-section.scss', './nutrition-form.scss'],
})
export class NutritionForm {
  protected readonly store = inject(ProductFormStore);
  protected readonly nutritionRows = NUTRITION_ROWS;

  /**
   * La phrase sous le poids quand il est **hérité**, et rien sinon.
   *
   * 🔴 Le poids voyage par la route du TARIF, et `saveNutrition` ne l'envoie
   * qu'au prix propre à la déclinaison : sur un tarif aligné, l'écriture est
   * SAUTÉE. Un champ resté saisissable aurait donc accepté la frappe et jeté la
   * valeur — « un no-op silencieux a l'exacte apparence d'un succès ».
   *
   * Ce n'est pas un contournement, c'est la vérité du modèle : une déclinaison
   * au tarif aligné n'a pas de poids propre, elle lit celui du défaut. La
   * phrase le dit et donne le geste de sortie, parce que le drapeau qui ferme
   * ce champ se décoche dans une AUTRE carte que celle où il est lu.
   */
  protected readonly weightHint = computed(() =>
    this.store.pricingAligned()
      ? 'Hérité de la déclinaison par défaut : le poids suit le tarif. Décochez ' +
        '« Aligner sur la déclinaison par défaut » dans « Tarif & TVA » pour en saisir un propre.'
      : undefined,
  );
}
