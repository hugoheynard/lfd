import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
} from '@angular/core';
import type { ContentLocale, MailCopyTextView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldTextareaComponent,
} from 'fold-ng';

import { COPY_LOCALES, LOCALE_LABELS, rowsFor } from '../../../textes-boutique/rules/copy-text';
import { pathLabel } from '../../rules/mail-labels';
import {
  canResetTo,
  insertVariable,
  stateOf,
  textKey,
  type TextState,
} from '../../rules/mail-text';
import { MailCopyStore } from '../../state/mail-copy-store';
import { MailDraftWriter } from '../../state/mail-draft-writer';

/** Une langue d'un texte, telle que sa colonne la montre. */
export interface LocaleColumn {
  readonly locale: ContentLocale;
  readonly label: string;
  readonly hint: string | undefined;
  readonly shown: string;
  readonly rows: number;
  readonly state: TextState | null;
  readonly stale: boolean;
  readonly refusal: string | null;
  /** Le texte du code, seulement quand le champ montre autre chose. */
  readonly original: string | null;
  readonly canReset: boolean;
}

/** Une variable du texte, et si le texte peut s'en passer. */
export interface VariableChip {
  readonly name: string;
  readonly required: boolean;
}

/**
 * **Un texte d'un e-mail, ses trois langues côte à côte** (C4) — le français
 * en référence. Chaque champ part en brouillon au fil de la frappe ; dessous,
 * l'état, le refus du serveur tel quel (C5), l'avertissement quand le
 * français a changé depuis la traduction, le texte du code et « Rétablir ».
 *
 * Les variables permises sont des boutons : un clic insère `{nom}` dans le
 * dernier champ touché, au curseur. Les obligatoires sont marquées.
 */
@Component({
  selector: 'app-mail-text-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldTextareaComponent,
  ],
  templateUrl: './mail-text-editor.html',
  styleUrl: './mail-text-editor.scss',
})
export class MailTextEditor {
  readonly text = input.required<MailCopyTextView>();
  /** `false` : l'e-mail part toujours en français, quelle que soit la langue. */
  readonly followsLocale = input(true);
  /** Un texte que le code ne connaît plus : lu, et seulement rétabli. */
  readonly orphan = input(false);

  protected readonly store = inject(MailCopyStore);
  protected readonly writer = inject(MailDraftWriter);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** Le dernier champ touché : celui où une variable s'insère. */
  protected readonly active = signal<ContentLocale>('fr');
  protected readonly activeLabel = computed(() => LOCALE_LABELS[this.active()].toLowerCase());

  protected readonly title = computed(() => pathLabel(this.text().path));
  protected readonly readOnly = computed(() => !this.store.canWrite() || this.orphan());
  protected readonly conflict = computed(() => this.writer.conflicts().has(textKey(this.text())));

  protected readonly chips = computed<readonly VariableChip[]>(() => {
    const required = new Set(this.text().requiredVariables);
    return this.text().variables.map((name) => ({ name, required: required.has(name) }));
  });

  protected readonly required = computed(() =>
    this.text().requiredVariables.map((name) => `{${name}}`),
  );

  protected readonly columns = computed<readonly LocaleColumn[]>(() => {
    const text = this.text();
    return COPY_LOCALES.map((locale) => {
      const view = text.locales[locale];
      const shown = this.writer.textOf(text, locale);
      return {
        locale,
        label: LOCALE_LABELS[locale],
        hint:
          !this.followsLocale() && locale !== 'fr'
            ? 'Pas envoyé : cet e-mail part toujours en français.'
            : undefined,
        shown,
        rows: rowsFor(shown),
        state: stateOf(view, shown),
        stale: locale !== 'fr' && text.staleTranslations.includes(locale),
        refusal: this.writer.refusalOf(text, locale),
        original: view.default !== null && view.default !== shown ? view.default : null,
        canReset: canResetTo(view, shown),
      };
    });
  });

  protected edit(locale: ContentLocale, value: string): void {
    this.writer.edit(this.text(), locale, value);
  }

  protected reset(locale: ContentLocale): void {
    void this.writer.reset(this.text(), locale);
  }

  /** Insère `{name}` au curseur du dernier champ touché, et y rend la main. */
  protected insert(name: string): void {
    const locale = this.active();
    const field = this.host.nativeElement.querySelector<HTMLTextAreaElement>(
      `[data-locale="${locale}"] textarea`,
    );
    const current = this.writer.textOf(this.text(), locale);
    const start = field?.selectionStart ?? current.length;
    const end = field?.selectionEnd ?? current.length;
    const next = insertVariable(current, name, start, end);
    this.writer.edit(this.text(), locale, next.text);
    afterNextRender(
      () => {
        field?.focus();
        field?.setSelectionRange(next.caret, next.caret);
      },
      { injector: this.injector },
    );
  }
}
