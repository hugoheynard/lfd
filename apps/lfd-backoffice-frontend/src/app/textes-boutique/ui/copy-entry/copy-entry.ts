import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { ContentLocale, ShopCopyEntryView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldTextareaComponent,
} from 'fold-ng';

import { COPY_LOCALES, LOCALE_LABELS, segmentsOf } from '../../rules/copy-text';
import { CopyNavigation } from '../../state/copy-navigation';
import { DraftWriter } from '../../state/draft-writer';
import { ShopCopyStore } from '../../state/shop-copy-store';

/**
 * **Un texte, en trois langues** (plan §7, colonne 2) : le champ de chaque
 * langue, le texte du code en gris dessous, les `{variables}` en pastilles, le
 * refus immédiat d'une variable perdue, l'avertissement quand le français a
 * changé depuis une traduction, et « Revenir à l'original ».
 */
@Component({
  selector: 'app-copy-entry',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldTextareaComponent,
  ],
  templateUrl: './copy-entry.html',
  styleUrl: './copy-entry.scss',
})
export class CopyEntry {
  readonly entry = input.required<ShopCopyEntryView>();

  protected readonly writer = inject(DraftWriter);
  protected readonly store = inject(ShopCopyStore);
  private readonly navigation = inject(CopyNavigation);

  protected readonly locales = COPY_LOCALES;
  protected readonly labels = LOCALE_LABELS;
  protected readonly segments = segmentsOf;

  protected readonly selected = computed(() => this.navigation.selectedKey() === this.entry().key);
  protected readonly conflict = computed(() => this.writer.conflicts().has(this.entry().key));

  protected isStale(locale: ContentLocale): boolean {
    return this.entry().staleTranslations.includes(locale);
  }

  /** Il y a quelque chose à défaire : un brouillon, ou un remplacement publié. */
  protected canReset(locale: ContentLocale): boolean {
    const view = this.entry().locales[locale];
    return (
      view.draftState === 'set' || (view.draftState === 'unchanged' && view.publishedText !== null)
    );
  }

  protected stateLabel(locale: ContentLocale): string | null {
    switch (this.entry().locales[locale].draftState) {
      case 'set':
        return 'Brouillon';
      case 'reset':
        return 'Revient à l’original au prochain Publier';
      default:
        return this.entry().locales[locale].publishedText === null ? null : 'Modifié en ligne';
    }
  }

  protected select(): void {
    this.navigation.selectedKey.set(this.entry().key);
  }
}
