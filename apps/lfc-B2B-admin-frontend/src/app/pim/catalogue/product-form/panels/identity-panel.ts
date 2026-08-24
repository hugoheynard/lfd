import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { LOCALES, SOURCE_LOCALE, type Locale } from '@lfd/pim-contracts';

import {
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldOptionComponent,
} from 'fold-ng';

import { LangSwitch } from '../../../../shared/lang-switch/lang-switch';
import { ProductFormStore } from '../product-form-store';

/** Les langues nommées, pour la phrase qui dit ce qui manque. */
const LOCALE_NAMES: Readonly<Record<Locale, string>> = {
  fr: 'français',
  en: 'anglais',
  it: 'italien',
};

/**
 * Panneau Identité — nom, nature, famille. La **référence** y figure en lecture
 * seule (édition seulement) : elle est émise par le référentiel, pas saisie.
 */
@Component({
  selector: 'app-identity-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LangSwitch,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldOptionComponent,
  ],
  templateUrl: './identity-panel.html',
  styleUrl: './panel.scss',
})
export class IdentityPanel {
  protected readonly store = inject(ProductFormStore);
  protected readonly sourceLocale = SOURCE_LOCALE;

  /** Le libellé dit DANS QUELLE LANGUE on écrit — sinon deux langues se
   *  ressemblent assez pour qu'on croie relire le même champ. */
  protected readonly nameLabel = computed(
    () => `Nom du produit (${LOCALE_NAMES[this.store.nameLocale()]})`,
  );

  /**
   * Ce qui manque, en toutes lettres. Le point ambre du sélecteur dit « regarde
   * ici » ; sans cette phrase il faudrait ouvrir les trois langues pour savoir
   * laquelle pèche. Rien à dire quand tout est traduit — une ligne qui annonce
   * « rien ne manque » est du bruit permanent.
   */
  protected readonly missingHint = computed(() => {
    const missing = this.store.nameMissing().filter((locale) => locale !== SOURCE_LOCALE);
    if (missing.length === 0) {
      return undefined;
    }
    const named = missing.map((locale) => LOCALE_NAMES[locale]).join(' et ');
    const done = LOCALES.filter((locale) => !missing.some((m) => m === locale))
      .map((locale) => LOCALE_NAMES[locale])
      .join(', ');
    return `Le nom manque en ${named}. Renseigné en ${done}.`;
  });
}
