import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { FreeBlock, MailLocale } from '@lfd/mail-blocks';
import { FoldInputComponent, FoldTextareaComponent } from 'fold-ng';

import { textOf, withText } from '../../rules/mail-document-edits';

/**
 * **Le texte d'un bloc libre, écrit sur place** (plan `plan-editeur-par-blocs.md`,
 * § 6) dans la langue choisie : un titre ou le libellé d'un bouton sur une
 * ligne, un paragraphe ou un encadré sur plusieurs. Un séparateur n'a pas de
 * texte. Chaque frappe rend le bloc modifié — jamais muté.
 */
@Component({
  selector: 'app-mail-free-block-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldInputComponent, FoldTextareaComponent],
  templateUrl: './mail-free-block-editor.html',
})
export class MailFreeBlockEditor {
  readonly block = input.required<FreeBlock>();
  readonly locale = input.required<MailLocale>();
  readonly blockChange = output<FreeBlock>();

  protected readonly text = computed(() => textOf(this.block(), this.locale()));
  protected readonly label = computed(() => {
    const language = this.locale().toUpperCase();
    return this.block().kind === 'button' ? `Texte du bouton (${language})` : `Texte (${language})`;
  });

  protected write(text: string): void {
    this.blockChange.emit(withText(this.block(), this.locale(), text));
  }
}
