import type { ColumnsBlock, FreeBlock, MailBlock, MailDocument } from '@lfd/mail-blocks';

import { withImageWidth } from './mail-document-edits';

/**
 * **Déplacer un bloc entre le fil et les colonnes** (demande de Hugo du
 * 2026-11-08 : « drag and drop des éléments à l'intérieur des colonnes »).
 *
 * Un seul geste, une seule édition : le bloc quitte sa place et prend la
 * nouvelle dans le MÊME document rendu — l'aperçu n'est relu qu'une fois.
 * Pur : l'ancien document n'est jamais touché.
 *
 * Deux refus sont structurels, parce que le contrat les rend inexprimables
 * (`ColumnsBlock.cells: FreeBlock[][]`) : une mise en page ne se range pas
 * dans une colonne, un bloc du modèle non plus — le document est rendu tel
 * quel. Une image pleine largeur qui entre dans une colonne y repasse « dans
 * le texte » dans la même édition : une colonne n'a pas de bord de carte, et
 * la règle la refuserait (`full-width-image-in-column`).
 */

/** Une liste qui reçoit des blocs : le fil de l'e-mail, ou une cellule d'une mise en page. */
export type BlockContainer =
  | { readonly kind: 'flow' }
  | { readonly kind: 'cell'; readonly columnsId: string; readonly cell: number };

/** Une place dans une liste ; l'index est celui d'après le retrait, comme le rend CDK. */
export interface BlockSlot {
  readonly container: BlockContainer;
  readonly index: number;
}

/** D'où vient le bloc : une place du document, ou un bloc neuf de la bibliothèque. */
export type BlockOrigin = BlockSlot | { readonly added: FreeBlock | ColumnsBlock };

export const FLOW: BlockContainer = { kind: 'flow' };

/** Le bloc à une place du document ; `null` s'il n'y en a pas. */
export function blockAt(document: MailDocument, slot: BlockSlot): MailBlock | null {
  return listOf(document, slot.container)?.[slot.index] ?? null;
}

/** La place d'un bloc, où qu'il soit ; `null` s'il n'est pas dans le document. */
export function slotOf(document: MailDocument, blockId: string): BlockSlot | null {
  const top = document.blocks.findIndex((block) => block.id === blockId);
  if (top >= 0) {
    return { container: FLOW, index: top };
  }
  for (const block of document.blocks) {
    if (block.kind !== 'columns') {
      continue;
    }
    for (const [cell, blocks] of block.cells.entries()) {
      const index = blocks.findIndex((inner) => inner.id === blockId);
      if (index >= 0) {
        return { container: { kind: 'cell', columnsId: block.id, cell }, index };
      }
    }
  }
  return null;
}

/** Ce bloc peut-il entrer dans une colonne ? Ni une mise en page, ni un bloc du modèle. */
export function fitsInCell(block: MailBlock): block is FreeBlock {
  return block.kind !== 'columns' && block.kind !== 'model';
}

/** Le bloc, une fois entré dans une colonne : une image pleine largeur y passe dans le texte. */
export function narrowedForCell(block: FreeBlock): FreeBlock {
  return block.kind === 'image' && block.width === 'full'
    ? withImageWidth(block, 'content')
    : block;
}

/** Le dépôt fera passer une image pleine largeur dans le texte. */
export function narrowsImage(block: MailBlock, to: BlockContainer): boolean {
  return to.kind === 'cell' && block.kind === 'image' && block.width === 'full';
}

/**
 * Déplace un bloc (ou pose un bloc neuf) de `from` à `to`. Une place qui
 * n'existe pas, ou un refus structurel, rend le document tel quel.
 */
export function moveBlock(document: MailDocument, from: BlockOrigin, to: BlockSlot): MailDocument {
  const moved = 'added' in from ? from.added : blockAt(document, from);
  if (moved === null || listOf(document, to.container) === null) {
    return document;
  }
  if (to.container.kind === 'cell' && !fitsInCell(moved)) {
    return document;
  }
  if ('added' in from === false && sameSlot(from, to)) {
    return document;
  }
  const without = 'added' in from ? document : removeAt(document, from);
  return insertAt(without, to, moved);
}

function sameSlot(from: BlockSlot, to: BlockSlot): boolean {
  return sameContainer(from.container, to.container) && from.index === to.index;
}

function sameContainer(a: BlockContainer, b: BlockContainer): boolean {
  if (a.kind === 'flow' || b.kind === 'flow') {
    return a.kind === b.kind;
  }
  return a.columnsId === b.columnsId && a.cell === b.cell;
}

function listOf(document: MailDocument, container: BlockContainer): readonly MailBlock[] | null {
  if (container.kind === 'flow') {
    return document.blocks;
  }
  const columns = document.blocks.find(
    (block): block is ColumnsBlock => block.kind === 'columns' && block.id === container.columnsId,
  );
  return columns?.cells[container.cell] ?? null;
}

function removeAt(document: MailDocument, slot: BlockSlot): MailDocument {
  return editList(document, slot.container, (blocks) => blocks.filter((_, i) => i !== slot.index));
}

function insertAt(document: MailDocument, slot: BlockSlot, block: MailBlock): MailDocument {
  if (slot.container.kind === 'cell') {
    if (!fitsInCell(block)) {
      return document;
    }
    const inner = narrowedForCell(block);
    return editCell(document, slot.container, (blocks) => spliced(blocks, slot.index, inner));
  }
  return { ...document, blocks: spliced(document.blocks, slot.index, block) };
}

function spliced<T>(list: readonly T[], index: number, item: T): readonly T[] {
  const at = Math.min(Math.max(index, 0), list.length);
  return [...list.slice(0, at), item, ...list.slice(at)];
}

function editList(
  document: MailDocument,
  container: BlockContainer,
  edit: (blocks: readonly MailBlock[]) => readonly MailBlock[],
): MailDocument {
  if (container.kind === 'flow') {
    return { ...document, blocks: edit(document.blocks) };
  }
  return editCell(document, container, (blocks) => edit(blocks).filter(fitsInCell));
}

function editCell(
  document: MailDocument,
  container: Extract<BlockContainer, { kind: 'cell' }>,
  edit: (blocks: readonly FreeBlock[]) => readonly FreeBlock[],
): MailDocument {
  return {
    ...document,
    blocks: document.blocks.map((block) =>
      block.kind === 'columns' && block.id === container.columnsId
        ? {
            ...block,
            cells: block.cells.map((cell, index) => (index === container.cell ? edit(cell) : cell)),
          }
        : block,
    ),
  };
}

/** L'identifiant de la liste CDK d'une cellule — le canevas et ses colonnes le calculent pareil. */
export function cellListId(prefix: string, columnsId: string, cell: number): string {
  return `${prefix}-cell-${columnsId}-${String(cell)}`;
}

/** Les listes de toutes les cellules du document, dans l'ordre du fil. */
export function cellListIds(document: MailDocument, prefix: string): readonly string[] {
  return document.blocks.flatMap((block) =>
    block.kind === 'columns'
      ? block.cells.map((_, cell) => cellListId(prefix, block.id, cell))
      : [],
  );
}

/** Ce qu'un bloc glissé porte en donnée CDK — une carte de la bibliothèque porte sa clé. */
export interface DraggedBlock {
  readonly blockId: string;
}

/** L'identifiant du bloc glissé ; `null` si la donnée n'en porte pas (une carte de la bibliothèque). */
export function draggedBlockId(data: unknown): string | null {
  return typeof data === 'object' &&
    data !== null &&
    'blockId' in data &&
    typeof data.blockId === 'string'
    ? data.blockId
    : null;
}

/** Une destination du geste clavier « Déplacer vers… ». */
export interface MoveDestination {
  readonly value: string;
  readonly label: string;
  /** Où le bloc tombe : sous sa mise en page pour le fil, au bas de la cellule sinon. */
  readonly slot: BlockSlot;
}

const FLOW_VALUE = 'flow';

/** La valeur de la place actuelle d'un bloc dans « Déplacer vers… ». */
export function destinationValueOf(container: BlockContainer): string {
  return container.kind === 'flow'
    ? FLOW_VALUE
    : `${container.columnsId}#${String(container.cell)}`;
}

/**
 * Les places où un bloc libre peut aller au clavier — le glisser n'est jamais
 * le seul moyen (RGAA 7.1). Le fil, puis chaque colonne de chaque mise en
 * page, dans l'ordre de l'e-mail. Un bloc qui n'entre pas dans une colonne
 * (mise en page, bloc du modèle) n'a que le fil.
 */
export function moveDestinations(
  document: MailDocument,
  blockId: string,
): readonly MoveDestination[] {
  const from = slotOf(document, blockId);
  const block = from === null ? null : blockAt(document, from);
  if (from === null || block === null) {
    return [];
  }
  const flowIndex =
    from.container.kind === 'cell'
      ? document.blocks.findIndex(
          (candidate) =>
            from.container.kind === 'cell' && candidate.id === from.container.columnsId,
        ) + 1
      : from.index;
  const destinations: MoveDestination[] = [
    {
      value: FLOW_VALUE,
      label: 'Dans l’e-mail, hors des colonnes',
      slot: { container: FLOW, index: flowIndex },
    },
  ];
  if (!fitsInCell(block)) {
    return destinations;
  }
  let layout = 0;
  for (const candidate of document.blocks) {
    if (candidate.kind !== 'columns') {
      continue;
    }
    layout++;
    candidate.cells.forEach((cell, index) => {
      const container: BlockContainer = { kind: 'cell', columnsId: candidate.id, cell: index };
      const here = destinationValueOf(container) === destinationValueOf(from.container);
      destinations.push({
        value: destinationValueOf(container),
        label: `Mise en page ${String(layout)} · colonne ${String(index + 1)} sur ${String(candidate.cells.length)}`,
        slot: { container, index: here ? from.index : cell.length },
      });
    });
  }
  return destinations;
}
