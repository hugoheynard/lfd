import {
  InvoiceArchiveEmptyError,
  InvoiceArchiveNotRenderedError,
  InvoiceArchiveNotVisibleError,
  InvoiceArchiveTooLargeError,
} from "../errors/invoice-archive-errors.js";
import {
  filteredLedger,
  NO_LEDGER_FILTER,
  type FilterableEntry,
  type LedgerFilter,
} from "./my-invoices-ledger.js";

/**
 * **Le zip de « Mes factures »** (plan `plan-page-mes-factures.md`, lot P2,
 * §7.5) : quelles pièces il porte, sous quels noms, et ce qui le fait
 * refuser. Un zip est entier ou n'est pas.
 */

/** Au-delà, on resserre le filtre : un zip se fabrique en mémoire, d'un bloc. */
export const INVOICE_ARCHIVE_MAX_PIECES = 200;

/** Les pièces désignées : les filtres de la liste, ou une sélection d'ids — jamais les deux. */
export type ArchiveSelection =
  | { readonly by: "filter"; readonly filter: LedgerFilter }
  | { readonly by: "ids"; readonly ids: readonly string[] };

/** Une pièce visible, telle que la sélection la lit. */
export interface ArchiveCandidate extends FilterableEntry {
  readonly id: string;
  /** Son PDF est rangé (clé et empreinte figées). */
  readonly rendered: boolean;
}

/**
 * Les pièces du zip, plus récentes d'abord, parmi celles que la société voit.
 *
 * @throws {InvoiceArchiveNotVisibleError} un id ne désigne aucune pièce visible.
 * @throws {InvoiceArchiveEmptyError} rien ne répond au filtre.
 * @throws {InvoiceArchiveTooLargeError} plus de {@link INVOICE_ARCHIVE_MAX_PIECES} pièces.
 * @throws {InvoiceArchiveNotRenderedError} une pièce retenue n'a pas son PDF.
 */
export function archivePieces<T extends ArchiveCandidate>(
  visible: readonly T[],
  selection: ArchiveSelection,
): readonly T[] {
  const pieces = selected(visible, selection);
  if (pieces.length === 0) {
    throw new InvoiceArchiveEmptyError();
  }
  if (pieces.length > INVOICE_ARCHIVE_MAX_PIECES) {
    throw new InvoiceArchiveTooLargeError(pieces.length, INVOICE_ARCHIVE_MAX_PIECES);
  }
  const unrendered = pieces.filter((piece) => !piece.rendered).map((piece) => piece.number);
  if (unrendered.length > 0) {
    throw new InvoiceArchiveNotRenderedError(unrendered);
  }
  return pieces;
}

function selected<T extends ArchiveCandidate>(
  visible: readonly T[],
  selection: ArchiveSelection,
): readonly T[] {
  if (selection.by === "filter") {
    return filteredLedger(visible, selection.filter);
  }
  const wanted = new Set(selection.ids);
  const known = new Set(visible.map((piece) => piece.id));
  const unknown = [...wanted].filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new InvoiceArchiveNotVisibleError(unknown);
  }
  return filteredLedger(
    visible.filter((piece) => wanted.has(piece.id)),
    NO_LEDGER_FILTER,
  );
}

/**
 * Le nom du zip : `factures-<société>-<filtre>.zip`. La société en lettres
 * ASCII minuscules (un nom de fichier traverse tous les systèmes) ; le filtre
 * dit la période et le genre, ou `selection`.
 */
export function archiveFileName(companyLabel: string, selection: ArchiveSelection): string {
  return `factures-${slug(companyLabel) || "societe"}-${selectionLabel(selection)}.zip`;
}

const KIND_LABEL = { invoice: "factures", credit_note: "avoirs" } as const;

function selectionLabel(selection: ArchiveSelection): string {
  if (selection.by === "ids") {
    return "selection";
  }
  const { year, month, kind } = selection.filter;
  const period =
    year === null ? "tout" : month === null ? String(year) : `${String(year)}-${pad(month)}`;
  return kind === null ? period : `${period}-${KIND_LABEL[kind]}`;
}

function pad(month: number): string {
  return String(month).padStart(2, "0");
}

function slug(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
