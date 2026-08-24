import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { SOURCE_LOCALE } from '@lfd/pim-contracts';

import { FoldInputComponent, FoldListboxComponent, FoldOptionComponent } from 'fold-ng';

import { LangSwitch } from '../../../../../shared/lang-switch/lang-switch';
import { LOCALE_NAMES, missingSentence } from '../../../../../shared/lang-switch/locale-names';
import { ProductFormStore } from '../../product-form-store';

/**
 * Panneau Identité — nom, nature, famille. La **référence** y figure en lecture
 * seule (édition seulement) : elle est émise par le référentiel, pas saisie.
 */
@Component({
  selector: 'app-identity-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LangSwitch, FoldInputComponent, FoldListboxComponent, FoldOptionComponent],
  templateUrl: './identity-form.html',
  styleUrls: ['../form-section.scss'],
})
export class IdentityForm {
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
  protected readonly missingHint = computed(() =>
    missingSentence('Le nom manque', this.store.nameMissing()),
  );
}
