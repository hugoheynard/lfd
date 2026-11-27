import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { OfferedOptionGroupView, OrderSaleUnit } from '@lfd/contracts';
import { FoldCheckboxComponent, FoldNumberInputComponent } from 'fold-ng';

import {
  choiceCeilingOf,
  choiceQuantityOf,
  withChoiceQuantity,
  type LineOptionChoice,
} from '../line-options';

/** Les mots du sélecteur, dans la langue de l'écran ; `{label}` et `{n}` y sont remplacés. */
export interface LineOptionsPickerWords {
  /** Le libellé du compteur d'un choix à la pièce : « Dont tranché ». */
  readonly count: string;
  /** Son aide : « Sur 4 ; le reste sans ». */
  readonly countHint: string;
}

/** Les mots du back-office, qui ne parle que français. */
export const FRENCH_PICKER_WORDS: LineOptionsPickerWords = {
  count: 'Dont {label}',
  countHint: 'Sur {n} ; le reste sans',
};

/**
 * **Choisir les options d'une ligne** (« dont 2 tranchés »,
 * `documentation/catalogue/plan-options-de-commande.md`, § 3.3) — le même
 * contrôle au panier de la boutique et dans la saisie de l'équipe.
 *
 * Un groupe par `fieldset`, nommé par sa légende. À la pièce, un compteur par
 * choix, borné par ce que le groupe laisse de la ligne (le reste est
 * « sans ») ; au poids, une case par choix, qui vaut pour toute la ligne. Il
 * ne calcule aucun prix : les options sont gratuites. Il ne garde rien — il
 * rend les choix suivants, et le panier les retient.
 */
@Component({
  selector: 'lfd-line-options-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCheckboxComponent, FoldNumberInputComponent],
  templateUrl: './line-options-picker.html',
  styleUrl: './line-options-picker.scss',
})
export class LineOptionsPicker {
  /** Les groupes proposés sur l'article, à la clientèle déjà résolue par le serveur. */
  readonly groups = input.required<readonly OfferedOptionGroupView[]>();
  readonly choices = input<readonly LineOptionChoice[]>([]);
  /** La quantité de la ligne : des pièces, ou des grammes au poids. */
  readonly quantity = input.required<number>();
  readonly saleUnit = input<OrderSaleUnit>('piece');
  readonly words = input<LineOptionsPickerWords>(FRENCH_PICKER_WORDS);

  /** Les choix suivants, déjà bornés. */
  readonly choicesChange = output<readonly LineOptionChoice[]>();

  protected readonly byWeight = computed(() => this.saleUnit() === 'weight');

  protected readonly countHint = computed(() =>
    this.words().countHint.replace('{n}', String(this.quantity())),
  );

  protected countLabel(label: string): string {
    return this.words().count.replace('{label}', label);
  }

  protected quantityOf(group: string, choice: string): number {
    return choiceQuantityOf(this.choices(), group, choice);
  }

  protected ceilingOf(group: string, choice: string): number {
    return choiceCeilingOf(this.choices(), group, choice, this.quantity());
  }

  protected set(group: string, choice: string, quantity: number | null): void {
    this.choicesChange.emit(
      withChoiceQuantity(this.choices(), { group, choice }, quantity ?? 0, {
        quantity: this.quantity(),
        saleUnit: this.saleUnit(),
      }),
    );
  }
}
