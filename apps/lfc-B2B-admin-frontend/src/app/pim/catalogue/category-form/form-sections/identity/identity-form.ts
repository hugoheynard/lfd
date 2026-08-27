import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { SOURCE_LOCALE } from '@lfd/pim-contracts';

import {
  FoldCalloutComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldOptionComponent,
} from 'fold-ng';

import { LangSwitch } from '../../../../../shared/lang-switch/lang-switch';
import { CategoryFormStore } from '../../category-form-store';

/**
 * Identité d'une famille : son nom, dans les trois langues, et sa place dans
 * l'arbre. Le strict nécessaire pour exister au catalogue.
 */
@Component({
  selector: 'app-category-identity-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LangSwitch,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldOptionComponent,
  ],
  templateUrl: './identity-form.html',
  styleUrls: ['../../../product-form/form-sections/form-section.scss'],
})
export class CategoryIdentityForm {
  protected readonly store = inject(CategoryFormStore);
  protected readonly sourceLocale = SOURCE_LOCALE;

  /** L'avertissement ne paraît qu'une fois le français posé : tant qu'il est
   *  vide, la famille n'est pas « mal traduite », elle n'est pas écrite. */
  protected readonly untranslated = computed(
    () => this.store.name.filled() && this.store.name.missing().length > 0,
  );
}
