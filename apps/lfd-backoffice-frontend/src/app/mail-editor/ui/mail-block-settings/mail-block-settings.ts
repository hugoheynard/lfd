import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  CALLOUT_TONES,
  COLUMN_WIDTH_STEPS,
  type CalloutTone,
  type ColumnsBlock,
  type ColumnWidthStep,
  type FreeBlock,
} from '@lfd/mail-blocks';
import { FoldInputComponent, FoldListboxComponent } from 'fold-ng';

import {
  CALLOUT_TONE_LABELS,
  CELL_LIBRARY_ITEMS,
  type LibraryItemKey,
} from '../../rules/mail-document-edits';
import { MailBlockLibrary } from '../mail-block-library/mail-block-library';

/** Une largeur choisie pour une colonne. */
export interface ColumnWidthChoice {
  readonly columnIndex: number;
  readonly width: ColumnWidthStep;
}

/** Un bloc à ajouter dans une colonne. */
export interface CellAddition {
  readonly cellIndex: number;
  readonly key: LibraryItemKey;
}

/**
 * **Les réglages du bloc libre sélectionné** (plan `plan-editeur-par-blocs.md`,
 * § 6, colonne de droite) : l'adresse d'un bouton, le ton d'un encadré, les
 * largeurs d'une mise en page sur les crans et ce qu'on pose dans ses
 * colonnes. Aucune règle ici : une adresse en `http://` ou des largeurs qui
 * ne font pas 100 % s'écrivent, et le canevas affiche le refus du paquet.
 */
@Component({
  selector: 'app-mail-block-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldInputComponent, FoldListboxComponent, MailBlockLibrary],
  templateUrl: './mail-block-settings.html',
  styleUrl: './mail-block-settings.scss',
})
export class MailBlockSettings {
  readonly block = input.required<FreeBlock | ColumnsBlock>();
  readonly blockChange = output<FreeBlock>();
  readonly widthChange = output<ColumnWidthChoice>();
  readonly cellAddition = output<CellAddition>();

  protected readonly toneOptions = CALLOUT_TONES.map((tone) => ({
    value: tone,
    label: CALLOUT_TONE_LABELS[tone],
  }));
  protected readonly widthOptions = COLUMN_WIDTH_STEPS.map((step) => ({
    value: step,
    label: `${step} %`,
  }));
  protected readonly cellItems = CELL_LIBRARY_ITEMS;
  protected readonly targetCell = signal(0);
  protected readonly cellOptions = computed(() => {
    const block = this.block();
    return block.kind === 'columns'
      ? block.cells.map((_, index) => ({ value: index, label: `Colonne ${index + 1}` }))
      : [];
  });

  protected setHref(href: string): void {
    const block = this.block();
    if (block.kind === 'button') {
      this.blockChange.emit({ ...block, href });
    }
  }

  protected setTone(tone: CalloutTone): void {
    const block = this.block();
    if (block.kind === 'callout') {
      this.blockChange.emit({ ...block, tone });
    }
  }

  protected setWidth(columnIndex: number, width: ColumnWidthStep): void {
    this.widthChange.emit({ columnIndex, width });
  }

  protected addToCell(key: LibraryItemKey): void {
    this.cellAddition.emit({ cellIndex: this.targetCell(), key });
  }
}
