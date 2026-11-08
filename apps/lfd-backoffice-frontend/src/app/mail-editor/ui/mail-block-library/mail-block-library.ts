import { CdkDrag, CdkDragPlaceholder, CdkDragPreview, CdkDropList } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FoldCardComponent, FoldElementTitleComponent } from 'fold-ng';

import type { ColumnsBlock, FreeBlock } from '@lfd/mail-blocks';

import {
  LIBRARY_ITEMS,
  newLibraryBlock,
  type LibraryItem,
  type LibraryItemKey,
} from '../../rules/mail-document-edits';
import { MailBlockSketch } from '../mail-block-sketch/mail-block-sketch';
import { MailInsertBar } from '../mail-insert-bar/mail-insert-bar';

/**
 * **La bibliothèque** (plan `plan-editeur-par-blocs.md`, § 6) : une carte par
 * bloc libre ou mise en page — icône, nom, ce que fait le bloc. Une carte se
 * clique (Entrée ou Espace au clavier : le glisser n'est jamais le seul
 * moyen) ou se glisse dans l'e-mail (demande de Hugo du 2026-11-08). Elle
 * n'ajoute rien elle-même : un clic dit ce qui a été choisi, un dépôt est
 * reçu par la liste du canevas — `connectedTo` — qui porte la clé en
 * `cdkDragData`.
 *
 * Le glisser COPIE : la liste ne trie pas, n'accepte rien, et pendant qu'une
 * carte est tirée, sa jumelle tient sa place — la bibliothèque ne perd
 * jamais une carte.
 */
@Component({
  selector: 'app-mail-block-library',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDrag,
    CdkDragPlaceholder,
    CdkDragPreview,
    CdkDropList,
    FoldCardComponent,
    FoldElementTitleComponent,
    MailBlockSketch,
    MailInsertBar,
  ],
  templateUrl: './mail-block-library.html',
  styleUrl: './mail-block-library.scss',
})
export class MailBlockLibrary {
  readonly items = input<readonly LibraryItem[]>(LIBRARY_ITEMS);
  /**
   * Les listes qui reçoivent un dépôt — le fil du canevas, et les cellules de
   * ses colonnes, cellules D'ABORD : CDK prend la première liste sous le
   * pointeur, et une cellule est aussi sous le fil qui la contient.
   */
  readonly connectedTo = input<string | readonly string[] | null>(null);
  readonly picked = output<LibraryItemKey>();
  /** La carte tirée, puis `null` au lâcher : le canevas ouvre ses cellules vides. */
  readonly draggingChange = output<LibraryItemKey | null>();

  /** La carte tirée : sa jumelle reste à sa place le temps du glisser. */
  protected readonly dragging = signal<LibraryItemKey | null>(null);

  protected readonly targets = computed<string[]>(() => {
    const target = this.connectedTo();
    if (target === null) {
      return [];
    }
    return typeof target === 'string' ? [target] : [...target];
  });

  /** Le bloc neuf de chaque carte, de la fabrique du clic : son esquisse montre sa place. */
  protected readonly sketches = computed(
    () =>
      new Map<LibraryItemKey, FreeBlock | ColumnsBlock>(
        this.items().map((item) => [item.key, newLibraryBlock(item.key, `sketch-${item.key}`)]),
      ),
  );

  /** Rien n'entre dans la bibliothèque : un bloc de l'e-mail ne s'y range pas. */
  protected readonly refuseEntry = (): boolean => false;

  protected startDragging(key: LibraryItemKey | null): void {
    this.dragging.set(key);
    this.draggingChange.emit(key);
  }

  protected ariaLabelOf(item: LibraryItem): string {
    return `Ajouter le bloc « ${item.label} » — ${item.description}`;
  }
}
