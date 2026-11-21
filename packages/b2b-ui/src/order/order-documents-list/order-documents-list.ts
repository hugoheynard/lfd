import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

import type { OrderDocument } from '../order-detail/order-detail';

/**
 * **Les pièces d'une commande**, en liste : chacune se télécharge, ou dit
 * pourquoi elle n'est pas là.
 *
 * Un composant à part pour se rendre à deux endroits sans être recopié : dans
 * le rail du détail (`lfd-order-detail`, la boutique), et dans l'onglet
 * « Documents » du back-office, qui le sort du rail.
 */
@Component({
  selector: 'lfd-order-documents-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  templateUrl: './order-documents-list.html',
  styleUrl: './order-documents-list.scss',
})
export class OrderDocumentsList {
  readonly documents = input.required<readonly OrderDocument[]>();

  /** Un document a été demandé — la `key` de l'entrée cliquée. */
  readonly documentAsked = output<string>();
}
