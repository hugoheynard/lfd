import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FoldButtonComponent } from 'fold-ng';

import {
  LIBRARY_ITEMS,
  type LibraryItem,
  type LibraryItemKey,
} from '../../rules/mail-document-edits';

/**
 * **La bibliothèque** (plan `plan-editeur-par-blocs.md`, § 6) : un bouton par
 * bloc libre ou mise en page. Elle n'ajoute rien elle-même — elle dit ce qui
 * a été choisi, et le canevas l'ajoute.
 */
@Component({
  selector: 'app-mail-block-library',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent],
  templateUrl: './mail-block-library.html',
  styleUrl: './mail-block-library.scss',
})
export class MailBlockLibrary {
  readonly items = input<readonly LibraryItem[]>(LIBRARY_ITEMS);
  readonly picked = output<LibraryItemKey>();
}
