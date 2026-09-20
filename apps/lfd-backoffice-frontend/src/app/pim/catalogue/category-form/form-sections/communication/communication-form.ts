import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { FoldInputComponent } from 'fold-ng';

import { LangSwitch } from '../../../../../shared/lang-switch/lang-switch';
import { LOCALE_NAMES, missingSentence } from '../../../../../shared/lang-switch/locale-names';
import { CategoryFormStore } from '../../category-form-store';
import { EDITORIAL_FIELDS, type EditorialField } from '../../editorial-draft';

/** La valeur d'un `<textarea>` natif, sans conversion de type. */
function textValue(event: Event): string {
  const target = event.target;
  return target instanceof HTMLTextAreaElement ? target.value : '';
}

/**
 * Section **Communication** d'une famille : ses quatre textes, dans les trois
 * langues.
 *
 * Un sélecteur pour les QUATRE, et non un par champ : on rédige une fiche dans
 * une langue, pas un champ dans une langue et le suivant dans une autre. C'est
 * l'arbitrage déjà pris sur la fiche produit.
 */
@Component({
  selector: 'app-category-communication-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LangSwitch, FoldInputComponent],
  templateUrl: './communication-form.html',
  styleUrls: ['../../../product-form/form-sections/form-section.scss'],
})
export class CategoryCommunicationForm {
  protected readonly store = inject(CategoryFormStore);
  protected readonly fields = EDITORIAL_FIELDS;
  protected readonly textValue = textValue;

  /** Le libellé nomme la langue en cours — deux langues se ressemblent assez
   *  pour qu'on croie relire le même champ. */
  protected labelOf(label: string): string {
    return `${label} (${LOCALE_NAMES[this.store.editorial.locale()]})`;
  }

  protected readonly missingHint = computed(() =>
    missingSentence('Des textes manquent', this.store.editorial.missing()),
  );

  protected value(field: EditorialField): string {
    return this.store.editorial.value(field);
  }

  protected set(field: EditorialField, value: string): void {
    this.store.editorial.set(field, value);
  }
}
