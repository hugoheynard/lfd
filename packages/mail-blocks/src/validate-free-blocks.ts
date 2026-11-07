import { isColumnWidthStep, widthsFillTheRow, type ColumnWidthStep } from "./column-widths.js";
import {
  CALLOUT_TONES,
  COLUMN_COUNTS,
  SHORT_BLOCK_KINDS,
  type ColumnsBlock,
  type FreeBlock,
  type MailBlock,
} from "./mail-document.js";
import { violation, type MailDocumentViolation } from "./mail-document-violation.js";

const HTTPS_PROTOCOL = "https:";

/** Une adresse absolue en `https://` ? Une adresse illisible ne l'est pas. */
export function isHttpsUrl(candidate: string): boolean {
  try {
    return new URL(candidate).protocol === HTTPS_PROTOCOL;
  } catch {
    return false;
  }
}

/** Les règles propres à un bloc libre (hors colonnes) : son adresse, son ton. */
export function freeBlockViolations(block: FreeBlock): readonly MailDocumentViolation[] {
  if (block.kind === "button" && !isHttpsUrl(block.href)) {
    return [
      violation(
        "href-not-https",
        block.id,
        `Le bouton pointe vers « ${block.href} », qui n'est pas une adresse en https:// : saisissez l'adresse complète, commençant par https://.`,
      ),
    ];
  }
  if (block.kind === "callout" && !CALLOUT_TONES.some((tone) => tone === block.tone)) {
    return [
      violation(
        "unknown-callout-tone",
        block.id,
        "Cet encadré n'a pas de ton reconnu : choisissez « information » ou « attention ».",
      ),
    ];
  }
  return [];
}

function cellBlockViolations(
  columns: ColumnsBlock,
  block: MailBlock,
): readonly MailDocumentViolation[] {
  if (block.kind === "model") {
    return [
      violation(
        "model-block-in-column",
        block.id,
        "Un bloc du modèle ne se place jamais dans une colonne : remettez-le dans le fil de l'e-mail.",
      ),
    ];
  }
  if (block.kind === "columns") {
    return [
      violation(
        "columns-in-column",
        block.id,
        "Une mise en page en colonnes ne se place pas dans une colonne : posez-la dans le fil de l'e-mail.",
      ),
    ];
  }
  const short = SHORT_BLOCK_KINDS.some((kind) => kind === block.kind);
  if (columns.cells.length === 3 && !short) {
    return [
      violation(
        "long-block-in-three-columns",
        block.id,
        "En trois colonnes, seuls un titre ou un bouton tiennent : passez à deux colonnes, ou sortez ce bloc des colonnes.",
      ),
    ];
  }
  return freeBlockViolations(block);
}

function widthViolations(columns: ColumnsBlock): readonly MailDocumentViolation[] {
  const unknown = columns.widths.filter((width) => !isColumnWidthStep(width));
  if (unknown.length > 0) {
    return [
      violation(
        "column-width-step",
        columns.id,
        `Largeur de colonne ${unknown.join(", ")} % hors des crans admis (25, 33, 50, 67, 75 %) : choisissez l'un d'eux.`,
      ),
    ];
  }
  const steps: readonly ColumnWidthStep[] = columns.widths.filter(isColumnWidthStep);
  if (!widthsFillTheRow(steps)) {
    return [
      violation(
        "column-widths-sum",
        columns.id,
        `Les largeurs ${columns.widths.join(" + ")} % ne font pas une ligne pleine : ajustez-les pour qu'elles fassent 100 %.`,
      ),
    ];
  }
  return [];
}

/** Les règles d'une mise en page en colonnes, et des blocs qu'elle porte. */
export function columnsViolations(columns: ColumnsBlock): readonly MailDocumentViolation[] {
  if (!COLUMN_COUNTS.some((count) => count === columns.cells.length)) {
    return [
      violation(
        "column-count",
        columns.id,
        `Une mise en page porte 2 ou 3 colonnes, celle-ci en a ${columns.cells.length} : choisissez la mise en page à 2 ou à 3 colonnes.`,
      ),
    ];
  }
  if (columns.widths.length !== columns.cells.length) {
    return [
      violation(
        "column-cells-mismatch",
        columns.id,
        `${columns.cells.length} colonnes pour ${columns.widths.length} largeurs : donnez une largeur à chaque colonne.`,
      ),
    ];
  }
  // Une cellule lue en JSON peut porter n'importe quel bloc : le type n'y
  // garantit rien, la règle le refuse.
  const cellBlocks: readonly MailBlock[] = columns.cells.flat();
  return [
    ...widthViolations(columns),
    ...cellBlocks.flatMap((block) => cellBlockViolations(columns, block)),
  ];
}
