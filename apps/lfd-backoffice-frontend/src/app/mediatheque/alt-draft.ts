import { signal } from '@angular/core';
import { SOURCE_LOCALE, writeLocalized, type Locale, type LocalizedText } from '@lfd/pim-contracts';

import { ALT_RECOMMENDED_LENGTH } from './image-facts';

/**
 * **Les alternatives d'une image, en cours de saisie** — les trois langues
 * ensemble : une traduction se juge à côté de sa source, pas de mémoire.
 *
 * Une classe et pas un service : elle vit le temps du panneau qui la crée.
 */
export class AltDraft {
  readonly text = signal<LocalizedText>({ fr: '' });

  valueOf(locale: string): string {
    return this.text()[locale as keyof LocalizedText] ?? '';
  }

  lengthOf(locale: string): number {
    return this.valueOf(locale).trim().length;
  }

  /** Au-delà, un avertissement — jamais un refus : une phrase juste vaut mieux qu'une phrase courte. */
  tooLong(locale: string): boolean {
    return this.lengthOf(locale) > ALT_RECOMMENDED_LENGTH;
  }

  write(locale: Locale, value: string): void {
    if (locale === SOURCE_LOCALE) {
      // 🔴 `writeLocalized` REFUSE d'effacer la langue source. Or vider le
      // français est ici un geste légitime — c'est ainsi qu'on déclare qu'une
      // image n'a pas d'alternative. Le brouillon le porte donc lui-même, et
      // le panneau en fait le repli à l'écriture.
      this.text.update((text) => ({ ...text, [SOURCE_LOCALE]: value }));
      return;
    }
    this.text.update((text) => writeLocalized(text, locale, value));
  }
}
