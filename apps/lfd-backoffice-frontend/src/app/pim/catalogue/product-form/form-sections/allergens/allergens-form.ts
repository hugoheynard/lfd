import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldFieldsetComponent,
  FoldMultiselectComponent,
} from 'fold-ng';

import type { AllergenScope } from '../../../../data/models';
import { ProductFormStore } from '../../product-form-store';

const SCOPES: readonly { value: AllergenScope; label: string }[] = [
  { value: 'eu', label: 'UE / France' },
  { value: 'world', label: 'Monde' },
];

/**
 * Panneau **Allergènes** — ce que la déclinaison contient, et ce qu'elle peut
 * contenir.
 *
 * 🔴 Séparé des valeurs nutritionnelles le 2026-09-22 : les deux partaient dans
 * la même requête, qui remplaçait la déclaration entière, si bien
 * qu'enregistrer une calorie effaçait les traces (plan
 * `plan-separer-allergenes-et-nutrition.md`, §1). Ce panneau n'envoie plus une
 * seule valeur nutritionnelle, et la section nutrition n'envoie plus un seul
 * code — chacune a sa route.
 *
 * Les **traces** sont ici et pas là-bas parce qu'une trace EST un allergène,
 * déclaré à un autre titre : même référentiel, même garde de chevauchement (§5).
 * Elles n'étaient saisissables nulle part ; elles le sont maintenant à l'endroit
 * où on décide ce que le produit contient.
 */
@Component({
  selector: 'app-allergens-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldFieldsetComponent,
    FoldMultiselectComponent,
  ],
  templateUrl: './allergens-form.html',
  styleUrls: ['../form-section.scss', './allergens-form.scss'],
})
export class AllergensForm {
  protected readonly store = inject(ProductFormStore);
  protected readonly scopes = SCOPES;
}
