import {
  CdkDrag,
  type CdkDragDrop,
  CdkDragHandle,
  CdkDragPlaceholder,
  CdkDragPreview,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { ColumnsBlock, FreeBlock, MailLocale, MailValueResource } from '@lfd/mail-blocks';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { type BlockContainer, cellListId, cellPercent } from '../../rules/mail-block-moves';
import { CALLOUT_TONE_LABELS, FREE_BLOCK_LABELS } from '../../rules/mail-document-edits';
import { freeBlockFallback } from '../../rules/mail-fragments';
import {
  type FreeBlockInput,
  MailBlockFragment,
  type PhraseInput,
} from '../mail-block-fragment/mail-block-fragment';
import { MailInsertBar } from '../mail-insert-bar/mail-insert-bar';

/** Un geste clavier sur un bloc de colonne : monter ou descendre d'un cran dans sa cellule. */
export interface CellBlockStep {
  readonly blockId: string;
  readonly delta: -1 | 1;
}

/**
 * **Les colonnes d'une mise en page, dans le canevas** (demande de Hugo du
 * 2026-11-08 : glisser des blocs à l'intérieur des colonnes).
 *
 * Chaque cellule est une liste de dépôt CDK (`cdkDropList`), connectée aux
 * autres cellules, au fil et à la bibliothèque : on y dépose une carte, on y
 * fait entrer un bloc du fil, on le fait passer d'une colonne à l'autre ou
 * ressortir. Les blocs d'une cellule ont leur poignée ; leur rendu est celui
 * du serveur, un fragment par bloc (`cellBlocks` de `block-previews`).
 *
 * Elle n'édite rien : un dépôt est rendu tel quel au canevas, qui fait LA
 * seule édition du geste. Le prédicat d'entrée vient du canevas aussi — une
 * mise en page ou un bloc du modèle n'y entre pas, et ne montre donc ni barre
 * ni aperçu.
 */
@Component({
  selector: 'app-mail-columns-cells',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
    CdkDragPreview,
    CdkDropList,
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    MailBlockFragment,
    MailInsertBar,
  ],
  templateUrl: './mail-columns-cells.html',
  styleUrl: './mail-columns-cells.scss',
})
export class MailColumnsCells {
  readonly block = input.required<ColumnsBlock>();
  /** Les fragments du serveur par bloc (`MailBlock.id`) — ceux des cellules compris. */
  readonly fragments = input.required<ReadonlyMap<string, string>>();
  /** La langue rendue : un bloc vide garde sa zone d'écriture dans celle-ci. */
  readonly locale = input.required<MailLocale>();
  /** Le préfixe des listes du canevas (`cellListId`). */
  readonly listPrefix = input.required<string>();
  /** Toutes les listes où un bloc d'une cellule peut aller — cellules d'abord, le fil ensuite. */
  readonly connectedTo = input<string[]>([]);
  readonly enterPredicate = input<(drag: CdkDrag) => boolean>(() => true);
  /** Un glisser qu'une cellule accepte est en cours : les cellules vides s'ouvrent. */
  readonly acceptsDrop = input(false);
  readonly canWrite = input(false);
  readonly phrasePaths = input<ReadonlySet<string>>(new Set());
  readonly freeBlockIds = input<ReadonlySet<string>>(new Set());
  readonly values = input<ReadonlyMap<string, MailValueResource>>(new Map());
  readonly selectedId = input<string | null>(null);
  /** La cellule vide choisie : la bibliothèque y ajoute au clic. */
  readonly selectedCell = input<number | null>(null);

  readonly dropped = output<CdkDragDrop<BlockContainer, BlockContainer, unknown>>();
  readonly innerSelected = output<string>();
  readonly cellSelected = output<number>();
  readonly stepped = output<CellBlockStep>();
  /** Un bloc de cellule est tiré (`true`), puis lâché (`false`). */
  readonly dragging = output<boolean>();
  readonly phraseInput = output<PhraseInput>();
  readonly freeBlockInput = output<FreeBlockInput>();
  readonly valueRefused = output<string>();

  protected idOf(cell: number): string {
    return cellListId(this.listPrefix(), this.block().id, cell);
  }

  protected containerOf(cell: number): BlockContainer {
    return { kind: 'cell', columnsId: this.block().id, cell };
  }

  protected percentOf(cell: number): number {
    return cellPercent(this.block().widths, cell);
  }

  /** Le rendu d'un bloc ; sa zone d'écriture s'il est vide ; `null` tant qu'aucun rendu ne l'a vu. */
  protected fragmentOf(block: FreeBlock): string | null {
    const html = this.fragments().get(block.id);
    if (html === undefined) {
      return null;
    }
    return html === '' ? (freeBlockFallback(block, this.locale()) ?? '') : html;
  }

  protected titleOf(block: FreeBlock): string {
    return block.kind === 'callout'
      ? `${FREE_BLOCK_LABELS.callout} · ${CALLOUT_TONE_LABELS[block.tone]}`
      : FREE_BLOCK_LABELS[block.kind];
  }

  protected handleLabelOf(block: FreeBlock, cell: number): string {
    return `Déplacer le bloc « ${this.titleOf(block)} » de la colonne ${String(cell + 1)} : glisser la poignée, ou Alt + flèche haut / bas sur le bloc ; « Déplacer vers » dans ses réglages`;
  }

  protected onKeydown(event: KeyboardEvent, blockId: string): void {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.innerSelected.emit(blockId);
    } else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      event.stopPropagation();
      this.stepped.emit({ blockId, delta: event.key === 'ArrowUp' ? -1 : 1 });
    }
  }
}
