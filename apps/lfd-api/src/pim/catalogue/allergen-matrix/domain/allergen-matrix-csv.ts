import {
  ALLERGEN_MATRIX_WORDING,
  type AllergenMatrixWording,
  type Locale,
} from "@lfd/pim-contracts";

import type { AllergenMatrix, MatrixFamily, MatrixRow } from "./allergen-matrix.js";
import type { MatrixCell, MatrixOthersCell } from "./matrix-row.js";
import { otherAllergenName } from "./other-allergen-name.js";

/** Le point-virgule : le séparateur qu'un tableur français attend. */
const SEPARATOR = ";";
/** Le BOM UTF-8, en séquence d'échappement : écrit au naturel, il est invisible. */
const BOM = "\uFEFF";
const LINE_END = "\r\n";
/** Entre « contient : … » et « traces : … » dans une même case. */
const PART_SEPARATOR = " / ";

/** Tout est cité : un nom de produit peut contenir un `;`. */
function quoted(value: string): string {
  return `"${value.replace(/"/gu, '""')}"`;
}

function lineOf(cells: readonly string[]): string {
  return cells.map(quoted).join(SEPARATOR);
}

/**
 * Une moitié de case : le mot seul quand il n'y a rien à nommer (« traces »),
 * le mot et les noms sinon (« contient : Blé, Épeautre »).
 */
function part(word: string, names: readonly string[]): string {
  return names.length === 0 ? word : `${word} : ${names.join(", ")}`;
}

/**
 * La case, dans les mots de la langue. Une case qui CONTIENT peut aussi
 * nommer des traces d'une autre céréale : les deux moitiés y sont.
 */
function cellText(
  presence: MatrixCell["presence"],
  contains: readonly string[],
  traces: readonly string[],
  wording: AllergenMatrixWording,
): string {
  if (presence === "absent") {
    return "";
  }
  const parts = [];
  if (presence === "contains") {
    parts.push(part(wording.presence.contains, contains));
  }
  if (traces.length > 0 || presence === "traces") {
    parts.push(part(wording.presence.traces, traces));
  }
  return parts.join(PART_SEPARATOR);
}

function othersText(others: MatrixOthersCell | null, wording: AllergenMatrixWording): string {
  if (others === null) {
    return "";
  }
  return cellText(
    others.presence,
    others.contains.map(otherAllergenName),
    others.traces.map(otherAllergenName),
    wording,
  );
}

function rowLine(
  family: MatrixFamily,
  row: MatrixRow,
  width: number,
  wording: AllergenMatrixWording,
): string {
  // Une ligne non renseignée n'a pas de case : des cellules vides, pas « absent ».
  const values =
    row.cells.length === 0
      ? Array.from({ length: width }, () => "")
      : row.cells.map((cell) => cellText(cell.presence, cell.contains, cell.traces, wording));
  return lineOf([
    family.name,
    row.productName,
    row.variantName ?? "",
    row.sku,
    wording.states[row.state],
    ...values,
    othersText(row.others, wording),
  ]);
}

/**
 * **Le tableur de la matrice** — les mêmes lignes que le JSON, une colonne par
 * catégorie de l'annexe II, la colonne « Autres » et la colonne d'état
 * (plan §1). Pur. Ses mots fixes viennent du dictionnaire unique
 * (`ALLERGEN_MATRIX_WORDING`) que le PDF lira aussi.
 */
export function allergenMatrixCsv(matrix: AllergenMatrix, locale: Locale): string {
  const wording = ALLERGEN_MATRIX_WORDING[locale];
  const { headers } = wording;
  const width = matrix.columns.length;
  const header = lineOf([
    headers.family,
    headers.product,
    headers.variant,
    headers.sku,
    headers.state,
    ...matrix.columns.map((column) => column.label),
    headers.others,
  ]);
  const lines = matrix.families.flatMap((family) =>
    family.rows.map((row) => rowLine(family, row, width, wording)),
  );
  return BOM + [header, ...lines].join(LINE_END) + LINE_END;
}
