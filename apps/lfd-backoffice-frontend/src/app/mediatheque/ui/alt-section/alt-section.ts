import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LOCALES, SOURCE_LOCALE } from '@lfd/pim-contracts';
import { FoldPageSectionComponent, FoldTextareaComponent } from 'fold-ng';

import { LOCALE_NAMES } from '../../../shared/lang-switch/locale-names';
import { ALT_RECOMMENDED_LENGTH } from '../../rules/image-facts';
import type { AltDraft } from '../../state/alt-draft';

/**
 * La section **Texte alternatif** du panneau « Décrire une image » — les
 * trois langues ensemble, leur longueur, et ce que dit un champ vide.
 *
 * Elle écrit dans la saisie qu'on lui confie : l'état reste au panneau, qui
 * l'enregistre avec le reste.
 */
@Component({
  selector: 'app-alt-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageSectionComponent, FoldTextareaComponent],
  templateUrl: './alt-section.html',
  styleUrl: './alt-section.scss',
})
export class AltSection {
  readonly draft = input.required<AltDraft>();

  protected readonly locales = LOCALES;
  protected readonly names = LOCALE_NAMES;
  protected readonly sourceLocale = SOURCE_LOCALE;
  protected readonly recommended = ALT_RECOMMENDED_LENGTH;
}
