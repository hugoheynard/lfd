import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { ShopCopyEntryView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldTextareaComponent,
} from 'fold-ng';

import { copyName } from '../../rules/copy-labels';
import { rowsFor, segmentsOf, upcomingText } from '../../rules/copy-text';
import { CopyNavigation } from '../../state/copy-navigation';
import { DraftWriter } from '../../state/draft-writer';
import { ShopCopyStore } from '../../state/shop-copy-store';

/** Ce que l'écran dit de l'état d'un texte, dans la langue affichée. */
export interface CopyState {
  readonly label: string;
  readonly variant: 'warning' | 'success';
}

/**
 * **Un texte, dans la langue affichée** (plan §7, colonne 2) : un seul champ,
 * pré-rempli de ce que la boutique dira — le brouillon, sinon le publié, sinon
 * le texte du code — et qu'on modifie en place. Son nom est un libellé lisible
 * (`rules/copy-labels`) ; la clé technique reste au survol de l'en-tête.
 *
 * Dessous : les `{variables}` à garder, le refus immédiat d'une variable
 * perdue, l'avertissement quand le français a changé depuis la traduction, et
 * le texte d'origine avec « Revenir à l'original » quand le texte s'en écarte.
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

  protected readonly segments = segmentsOf;

  protected readonly locale = this.navigation.locale;
  protected readonly label = computed(() => copyName(this.entry()).label);
  protected readonly view = computed(() => this.entry().locales[this.locale()]);
  protected readonly text = computed(() => this.writer.textOf(this.entry(), this.locale()));
  protected readonly rows = computed(() => rowsFor(this.text()));
  protected readonly missing = computed(() => this.writer.missing(this.entry(), this.locale()));

  protected readonly selected = computed(() => this.navigation.selectedKey() === this.entry().key);
  protected readonly conflict = computed(() => this.writer.conflicts().has(this.entry().key));
  protected readonly readOnly = computed(
    () => !this.store.canWrite() || this.entry().space === null,
  );

  /** Seules les traductions vieillissent : le français est la référence. */
  protected readonly stale = computed(
    () => this.locale() !== 'fr' && this.entry().staleTranslations.includes(this.locale()),
  );

  /** Le texte du code, seulement quand l'écran montre autre chose. */
  protected readonly original = computed(() => {
    const original = this.view().original;
    return original !== null && original !== this.text() ? original : null;
  });

  /** Il y a quelque chose à défaire : une frappe, un brouillon, ou un remplacement publié. */
  protected readonly canReset = computed(() => {
    const view = this.view();
    return (
      this.text() !== (view.original ?? '') ||
      view.draftState === 'set' ||
      (view.draftState === 'unchanged' && view.publishedText !== null)
    );
  });

  protected readonly state = computed<CopyState | null>(() => {
    const view = this.view();
    // Une frappe pas encore enregistrée est déjà un brouillon pour qui la lit.
    if (view.draftState !== 'unchanged' || this.text() !== upcomingText(view)) {
      return { label: 'Brouillon', variant: 'warning' };
    }
    return view.publishedText === null ? null : { label: 'Publié', variant: 'success' };
  });

  protected edit(text: string): void {
    this.writer.edit(this.entry(), this.locale(), text);
  }

  protected reset(): void {
    void this.writer.reset(this.entry(), this.locale());
  }

  protected select(): void {
    this.navigation.selectedKey.set(this.entry().key);
  }
}
