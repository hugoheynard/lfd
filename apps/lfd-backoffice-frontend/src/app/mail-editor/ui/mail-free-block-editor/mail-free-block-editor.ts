import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { FreeBlock, MailLocale } from '@lfd/mail-blocks';
import { FoldInputComponent, FoldTextareaComponent } from 'fold-ng';

import { textOf, withText } from '../../rules/mail-document-edits';

/**
 * **Le texte d'un bloc libre, écrit sur place** (plan `plan-editeur-par-blocs.md`,
 * § 6) dans la langue choisie : un titre ou le libellé d'un bouton sur une
 * ligne, un paragraphe ou un encadré sur plusieurs. Une image montre sa
 * vignette et son texte de remplacement — aucun si elle est décorative. Un
 * séparateur n'a pas de texte. Chaque frappe rend le bloc modifié — jamais muté.
 */
@Component({
  selector: 'app-mail-free-block-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldInputComponent, FoldTextareaComponent],
  templateUrl: './mail-free-block-editor.html',
  styleUrl: './mail-free-block-editor.scss',
})
export class MailFreeBlockEditor {
  readonly block = input.required<FreeBlock>();
  readonly locale = input.required<MailLocale>();
  readonly blockChange = output<FreeBlock>();

  protected readonly text = computed(() => textOf(this.block(), this.locale()));
  protected readonly label = computed(() => {
    const language = this.locale().toUpperCase();
    switch (this.block().kind) {
      case 'button':
        return `Texte du bouton (${language})`;
      case 'image':
        return `Texte de remplacement (${language})`;
      default:
        return `Texte (${language})`;
    }
  });
  protected readonly imageBlock = computed(() => {
    const block = this.block();
    return block.kind === 'image' ? block : null;
  });

  protected write(text: string): void {
    this.blockChange.emit(withText(this.block(), this.locale(), text));
  }
}
