import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { FoldInputComponent } from 'fold-ng';

import { LangSwitch } from '../../../../../shared/lang-switch/lang-switch';
import { LOCALE_NAMES, missingSentence } from '../../../../../shared/lang-switch/locale-names';
import { ProductFormStore, type LocalizedEditorialKey } from '../../product-form-store';
import { textValue } from '../dom';

interface EditorialField {
  readonly key: LocalizedEditorialKey;
  readonly label: string;
}

/** Les champs traduisibles présentés en grille. La MARQUE n'y est pas : elle ne
 *  se traduit pas, donc elle ne bascule pas avec le sélecteur. */
const FIELDS: readonly EditorialField[] = [
  { key: 'descriptionShort', label: 'Résumé court' },
  { key: 'seoTitle', label: 'Titre SEO' },
  { key: 'seoDescription', label: 'Description SEO' },
];

/** Panneau Communication — couche éditoriale complète (un seul save). */
@Component({
  selector: 'app-communication-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LangSwitch, FoldInputComponent],
  templateUrl: './communication-form.html',
  styleUrls: ['../form-section.scss'],
})
export class CommunicationForm {
  protected readonly store = inject(ProductFormStore);
  protected readonly textValue = textValue;
  protected readonly fields = FIELDS;

  /** Le libellé nomme la langue en cours — deux langues se ressemblent assez
   *  pour qu'on croie relire le même champ. */
  protected labelOf(field: EditorialField): string {
    return `${field.label} (${LOCALE_NAMES[this.store.editorialLocale()]})`;
  }

  protected readonly missingHint = computed(() =>
    missingSentence('Des textes manquent', this.store.editorialMissing()),
  );
}
