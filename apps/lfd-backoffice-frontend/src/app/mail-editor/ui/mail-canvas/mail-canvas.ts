import { CdkDrag, type CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  MODEL_SECTION_LABELS,
  validateMailDocument,
  type ColumnsBlock,
  type FreeBlock,
  type MailBlock,
  type MailDocument,
  type MailDocumentViolation,
  type MailLocale,
  type MailTemplateDeclaration,
} from '@lfd/mail-blocks';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldIconComponent,
} from 'fold-ng';

import {
  appendBlock,
  appendToCell,
  CALLOUT_TONE_LABELS,
  findEditableBlock,
  FREE_BLOCK_LABELS,
  type LibraryItemKey,
  moveBlock,
  moveBlockBy,
  newCellBlock,
  newLibraryBlock,
  removeBlock,
  replaceFreeBlock,
  setColumnWidth,
} from '../../rules/mail-document-edits';
import { MailBlockLibrary } from '../mail-block-library/mail-block-library';
import {
  type CellAddition,
  type ColumnWidthChoice,
  MailBlockSettings,
} from '../mail-block-settings/mail-block-settings';
import { MailFreeBlockEditor } from '../mail-free-block-editor/mail-free-block-editor';

/**
 * **Le canevas de l'éditeur d'e-mails** (plan `plan-editeur-par-blocs.md`,
 * § 6, lot S5b) : les blocs de l'e-mail dans l'ordre, déplacés par
 * glisser-déposer ou par « monter / descendre » (RGAA) ; les blocs du modèle
 * en cartes qu'on ne retire pas ; les blocs libres ajoutés depuis la
 * bibliothèque, écrits sur place dans la langue choisie, réglés et retirés.
 *
 * Composant pur : il reçoit le document et la déclaration du modèle, et rend
 * à chaque geste un NOUVEAU document (`documentChange`). Les refus affichés
 * sont ceux de `validateMailDocument` — aucune règle n'est recopiée ici.
 * La page qui le branche (lecture, enregistrement) vient avec S5a.
 */
@Component({
  selector: 'app-mail-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldIconComponent,
    MailBlockLibrary,
    MailBlockSettings,
    MailFreeBlockEditor,
  ],
  templateUrl: './mail-canvas.html',
  styleUrl: './mail-canvas.scss',
})
export class MailCanvas {
  readonly document = input.required<MailDocument>();
  readonly declaration = input.required<MailTemplateDeclaration>();
  /** La clé du modèle ouvert — la règle refuse un document d'un autre modèle. */
  readonly template = input.required<string>();
  /** La langue dans laquelle on écrit ; la page la choisit parmi celles du modèle. */
  readonly locale = input.required<MailLocale>();
  /** Fabrique l'identifiant d'un bloc neuf ; remplaçable en test. */
  readonly newId = input<() => string>(() => crypto.randomUUID());
  readonly documentChange = output<MailDocument>();

  protected readonly selectedId = signal<string | null>(null);

  protected readonly violations = computed<readonly MailDocumentViolation[]>(() =>
    validateMailDocument(this.document(), this.declaration(), this.template()),
  );
  /** Les refus qu'aucune carte ne porte : sans bloc, ou d'un bloc absent du canevas. */
  protected readonly documentViolations = computed(() => {
    const document = this.document();
    return this.violations().filter(
      (violation) =>
        violation.blockId === null ||
        (!document.blocks.some((block) => block.id === violation.blockId) &&
          findEditableBlock(document, violation.blockId) === null),
    );
  });
  protected readonly selected = computed(() => {
    const id = this.selectedId();
    return id === null ? null : findEditableBlock(this.document(), id);
  });

  protected readonly modelLabels = MODEL_SECTION_LABELS;

  protected violationsOf(blockId: string): readonly MailDocumentViolation[] {
    return this.violations().filter((violation) => violation.blockId === blockId);
  }

  protected titleOf(block: MailBlock): string {
    switch (block.kind) {
      case 'model':
        return MODEL_SECTION_LABELS[block.section];
      case 'callout':
        return `${FREE_BLOCK_LABELS.callout} · ${CALLOUT_TONE_LABELS[block.tone]}`;
      case 'columns':
        return `${block.cells.length} colonnes`;
      default:
        return FREE_BLOCK_LABELS[block.kind];
    }
  }

  protected hasSettings(block: FreeBlock | ColumnsBlock): boolean {
    return (
      block.kind === 'button' ||
      block.kind === 'image' ||
      block.kind === 'callout' ||
      block.kind === 'columns'
    );
  }

  protected dropped(event: CdkDragDrop<unknown>): void {
    this.emit(moveBlock(this.document(), event.previousIndex, event.currentIndex));
  }

  protected move(blockId: string, delta: -1 | 1): void {
    this.emit(moveBlockBy(this.document(), blockId, delta));
  }

  protected add(key: LibraryItemKey): void {
    const block = newLibraryBlock(key, this.newId()());
    this.emit(appendBlock(this.document(), block));
    this.selectedId.set(block.id);
  }

  protected remove(blockId: string): void {
    if (this.selectedId() === blockId) {
      this.selectedId.set(null);
    }
    this.emit(removeBlock(this.document(), blockId));
  }

  protected toggleSettings(blockId: string): void {
    this.selectedId.update((current) => (current === blockId ? null : blockId));
  }

  protected edited(block: FreeBlock): void {
    this.emit(replaceFreeBlock(this.document(), block));
  }

  protected widthChosen(columnsId: string, choice: ColumnWidthChoice): void {
    this.emit(setColumnWidth(this.document(), columnsId, choice.columnIndex, choice.width));
  }

  protected cellAdded(columnsId: string, addition: CellAddition): void {
    const block = newCellBlock(addition.key, this.newId()());
    if (block !== null) {
      this.emit(appendToCell(this.document(), columnsId, addition.cellIndex, block));
    }
  }

  private emit(next: MailDocument): void {
    if (next !== this.document()) {
      this.documentChange.emit(next);
    }
  }
}
