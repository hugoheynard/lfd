import type {
  CalloutTone,
  ColumnsBlock,
  ColumnWidthStep,
  FreeBlock,
  MailBlock,
  MailDocument,
  MailLocale,
} from '@lfd/mail-blocks';

/**
 * **Les gestes du canevas** (plan `plan-editeur-par-blocs.md`, § 6, lot S5b) —
 * des fonctions pures : chaque geste rend un NOUVEAU document, l'ancien n'est
 * jamais touché. Aucune règle n'est tenue ici : un geste qui produit un
 * document refusé le produit quand même, et c'est `validateMailDocument`
 * (`@lfd/mail-blocks`) qui le dit — l'écran ne recopie aucune règle du
 * serveur. Seule exception, structurelle : un bloc du modèle ne se retire pas,
 * le canevas n'offre pas ce geste.
 */

/** Ce que la bibliothèque propose d'ajouter. */
export type LibraryItemKey =
  | 'heading'
  | 'paragraph'
  | 'callout-info'
  | 'callout-warning'
  | 'button'
  | 'divider'
  | 'columns-2'
  | 'columns-3';

export interface LibraryItem {
  readonly key: LibraryItemKey;
  readonly label: string;
}

/** La bibliothèque, dans l'ordre où l'écran la montre. */
export const LIBRARY_ITEMS: readonly LibraryItem[] = [
  { key: 'heading', label: 'Titre' },
  { key: 'paragraph', label: 'Paragraphe' },
  { key: 'callout-info', label: 'Encadré information' },
  { key: 'callout-warning', label: 'Encadré attention' },
  { key: 'button', label: 'Bouton' },
  { key: 'divider', label: 'Séparateur' },
  { key: 'columns-2', label: 'Deux colonnes' },
  { key: 'columns-3', label: 'Trois colonnes' },
];

/** Ce qu'une colonne peut recevoir : la bibliothèque sans les mises en page. */
export const CELL_LIBRARY_ITEMS: readonly LibraryItem[] = LIBRARY_ITEMS.filter(
  (item) => item.key !== 'columns-2' && item.key !== 'columns-3',
);

/** Le nom d'une sorte de bloc libre, tel que l'équipe le lit. */
export const FREE_BLOCK_LABELS: Readonly<Record<MailBlock['kind'], string>> = {
  model: 'Bloc du modèle',
  heading: 'Titre',
  paragraph: 'Paragraphe',
  callout: 'Encadré',
  button: 'Bouton',
  divider: 'Séparateur',
  columns: 'Colonnes',
};

/** Le nom d'un ton d'encadré. */
export const CALLOUT_TONE_LABELS: Readonly<Record<CalloutTone, string>> = {
  info: 'Information',
  warning: 'Attention',
};

// Les largeurs de départ d'une mise en page : des colonnes égales.
const EVEN_WIDTHS: Readonly<Record<2 | 3, readonly ColumnWidthStep[]>> = {
  2: [50, 50],
  3: [33, 33, 33],
};

/**
 * Un bloc neuf de la bibliothèque, vide : aucun texte ni adresse inventés —
 * c'est l'équipe qui les écrit. Un encadré naît avec le ton choisi ; un bouton
 * sans adresse sera refusé par la règle tant qu'on ne l'a pas saisie.
 */
export function newLibraryBlock(key: LibraryItemKey, id: string): FreeBlock | ColumnsBlock {
  switch (key) {
    case 'heading':
    case 'paragraph':
      return { id, kind: key, text: {} };
    case 'callout-info':
      return { id, kind: 'callout', tone: 'info', text: {} };
    case 'callout-warning':
      return { id, kind: 'callout', tone: 'warning', text: {} };
    case 'button':
      return { id, kind: 'button', label: {}, href: '' };
    case 'divider':
      return { id, kind: 'divider' };
    case 'columns-2':
      return { id, kind: 'columns', widths: EVEN_WIDTHS[2], cells: [[], []] };
    case 'columns-3':
      return { id, kind: 'columns', widths: EVEN_WIDTHS[3], cells: [[], [], []] };
  }
}

/** Un bloc libre de cellule : la bibliothèque des cellules ne rend jamais de colonnes. */
export function newCellBlock(key: LibraryItemKey, id: string): FreeBlock | null {
  const block = newLibraryBlock(key, id);
  return block.kind === 'columns' ? null : block;
}

function withBlocks(document: MailDocument, blocks: readonly MailBlock[]): MailDocument {
  return { ...document, blocks };
}

/** Déplace le bloc du rang `from` au rang `to` (le glisser-déposer). */
export function moveBlock(document: MailDocument, from: number, to: number): MailDocument {
  const last = document.blocks.length - 1;
  if (from === to || from < 0 || from > last || to < 0 || to > last) {
    return document;
  }
  const blocks = [...document.blocks];
  const [moved] = blocks.splice(from, 1);
  if (moved === undefined) {
    return document;
  }
  blocks.splice(to, 0, moved);
  return withBlocks(document, blocks);
}

/** Monte (`-1`) ou descend (`1`) un bloc d'un cran — le geste au clavier. */
export function moveBlockBy(document: MailDocument, blockId: string, delta: -1 | 1): MailDocument {
  const from = document.blocks.findIndex((block) => block.id === blockId);
  return from < 0 ? document : moveBlock(document, from, from + delta);
}

/** Ajoute un bloc à la fin du fil de l'e-mail. */
export function appendBlock(document: MailDocument, block: FreeBlock | ColumnsBlock): MailDocument {
  return withBlocks(document, [...document.blocks, block]);
}

/** Ajoute un bloc libre au bas d'une cellule d'une mise en page. */
export function appendToCell(
  document: MailDocument,
  columnsId: string,
  cellIndex: number,
  block: FreeBlock,
): MailDocument {
  return withBlocks(
    document,
    document.blocks.map((candidate) =>
      candidate.kind === 'columns' && candidate.id === columnsId
        ? {
            ...candidate,
            cells: candidate.cells.map((cell, index) =>
              index === cellIndex ? [...cell, block] : cell,
            ),
          }
        : candidate,
    ),
  );
}

/**
 * Retire un bloc libre, du fil ou d'une cellule. Un bloc du modèle ne se
 * retire pas : le document est rendu tel quel.
 */
export function removeBlock(document: MailDocument, blockId: string): MailDocument {
  const top = document.blocks.find((block) => block.id === blockId);
  if (top?.kind === 'model') {
    return document;
  }
  const blocks = document.blocks
    .filter((block) => block.id !== blockId)
    .map((block) =>
      block.kind === 'columns'
        ? {
            ...block,
            cells: block.cells.map((cell) => cell.filter((inner) => inner.id !== blockId)),
          }
        : block,
    );
  return withBlocks(document, blocks);
}

/** Remplace un bloc libre (du fil ou d'une cellule) par sa version modifiée. */
export function replaceFreeBlock(document: MailDocument, next: FreeBlock): MailDocument {
  return withBlocks(
    document,
    document.blocks.map((block) => {
      if (block.id === next.id && block.kind !== 'model' && block.kind !== 'columns') {
        return next;
      }
      return block.kind === 'columns'
        ? {
            ...block,
            cells: block.cells.map((cell) =>
              cell.map((inner) => (inner.id === next.id ? next : inner)),
            ),
          }
        : block;
    }),
  );
}

/** Le texte d'un bloc libre dans une langue — le titre d'un bouton compris. */
export function textOf(block: FreeBlock, locale: MailLocale): string {
  switch (block.kind) {
    case 'heading':
    case 'paragraph':
    case 'callout':
      return block.text[locale] ?? '';
    case 'button':
      return block.label[locale] ?? '';
    case 'divider':
      return '';
  }
}

/** Écrit le texte d'un bloc libre dans une langue, sans toucher aux autres. */
export function withText(block: FreeBlock, locale: MailLocale, text: string): FreeBlock {
  switch (block.kind) {
    case 'heading':
    case 'paragraph':
    case 'callout':
      return { ...block, text: { ...block.text, [locale]: text } };
    case 'button':
      return { ...block, label: { ...block.label, [locale]: text } };
    case 'divider':
      return block;
  }
}

/** Change la largeur d'une colonne. La somme, c'est la règle qui la juge. */
export function setColumnWidth(
  document: MailDocument,
  columnsId: string,
  columnIndex: number,
  width: ColumnWidthStep,
): MailDocument {
  return withBlocks(
    document,
    document.blocks.map((block) =>
      block.kind === 'columns' && block.id === columnsId
        ? {
            ...block,
            widths: block.widths.map((current, index) => (index === columnIndex ? width : current)),
          }
        : block,
    ),
  );
}

/** Le bloc libre ou la mise en page d'identifiant donné, où qu'il soit. */
export function findEditableBlock(
  document: MailDocument,
  blockId: string,
): FreeBlock | ColumnsBlock | null {
  for (const block of document.blocks) {
    if (block.id === blockId) {
      return block.kind === 'model' ? null : block;
    }
    if (block.kind === 'columns') {
      const inner = block.cells.flat().find((candidate) => candidate.id === blockId);
      if (inner !== undefined) {
        return inner;
      }
    }
  }
  return null;
}
