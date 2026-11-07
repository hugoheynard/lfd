import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
} from '@angular/core';
import type { MailEditorPhraseView, MailLocale } from '@lfd/mail-blocks';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldTextareaComponent,
} from 'fold-ng';

import { LOCALE_LABELS, rowsFor } from '../../../textes-boutique/rules/copy-text';
import { pathLabel } from '../../../textes-emails/rules/mail-labels';
import { canResetTo, insertVariable, stateOf } from '../../../textes-emails/rules/mail-text';
import { MailPhrasesStore } from '../../state/mail-phrases-store';

/**
 * **Une phrase du modèle, dans la langue choisie** (plan § 3, S5b) — la
 * colonne d'une langue de l'éditeur de `textes-emails`, sur les routes
 * `mail_templates` : le champ part en brouillon au fil de la frappe ; dessous,
 * l'état, le refus du serveur tel quel, le texte du code et « Rétablir ».
 * Les variables restent visibles : un clic insère `{nom}` au curseur, les
 * obligatoires sont marquées.
 */
@Component({
  selector: 'app-mail-phrase-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldButtonComponent, FoldCalloutComponent, FoldTextareaComponent],
  templateUrl: './mail-phrase-editor.html',
  styleUrl: './mail-phrase-editor.scss',
})
export class MailPhraseEditor {
  readonly phrase = input.required<MailEditorPhraseView>();
  readonly locale = input.required<MailLocale>();
  readonly canWrite = input(false);

  protected readonly store = inject(MailPhrasesStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly label = computed(
    () => `${pathLabel(this.phrase().path)} (${LOCALE_LABELS[this.locale()].toLowerCase()})`,
  );
  protected readonly shown = computed(() => this.store.textOf(this.phrase(), this.locale()));
  protected readonly rows = computed(() => rowsFor(this.shown()));
  private readonly view = computed(() => this.phrase().locales[this.locale()]);
  protected readonly state = computed(() => stateOf(this.view(), this.shown()));
  protected readonly refusal = computed(() => this.store.refusalOf(this.phrase(), this.locale()));
  protected readonly conflict = computed(() => this.store.conflicts().has(this.phrase().path));
  protected readonly original = computed(() => {
    const original = this.view().default;
    return original !== null && original !== this.shown() ? original : null;
  });
  protected readonly canReset = computed(
    () => this.canWrite() && canResetTo(this.view(), this.shown()),
  );
  protected readonly chips = computed(() => {
    const required = new Set(this.phrase().requiredVariables);
    return this.phrase().variables.map((name) => ({ name, required: required.has(name) }));
  });
  protected readonly required = computed(() =>
    this.phrase().requiredVariables.map((name) => `{${name}}`),
  );

  protected edit(value: string): void {
    this.store.edit(this.phrase(), this.locale(), value);
  }

  protected reset(): void {
    void this.store.reset(this.phrase(), this.locale());
  }

  /** Insère `{name}` au curseur, et y rend la main. */
  protected insert(name: string): void {
    const field = this.host.nativeElement.querySelector<HTMLTextAreaElement>('textarea');
    const current = this.shown();
    const next = insertVariable(
      current,
      name,
      field?.selectionStart ?? current.length,
      field?.selectionEnd ?? current.length,
    );
    this.edit(next.text);
    afterNextRender(
      () => {
        field?.focus();
        field?.setSelectionRange(next.caret, next.caret);
      },
      { injector: this.injector },
    );
  }
}
