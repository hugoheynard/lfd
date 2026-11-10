import type { ExportPart } from "./bank-export-reference.js";

/**
 * **Les noms des fichiers qu'on dépose dans CENET** (Hugo, 2026-10-23 ; doc
 * `procedure-de-prelevement.md`, « Les identifiants courts et les noms de
 * fichiers »). Un fichier rangé sur un bureau perd son contexte, jamais son
 * nom : il dit pour quel portail, quel export ou quelle procédure, son rang
 * dans la série, ce qu'il porte et de quel jour il est.
 *
 * ASCII, sans espace. FIGÉS par export : tout ce qui entre dans un nom est
 * gardé à la préparation (numéro, rang, nombre de lignes, jour) — un second
 * téléchargement redonne le même nom.
 */
const PORTAL = "CENET";

/** Ce qui nomme le fichier d'un export de comptes ou de mandats. */
export interface BankExportFileNaming {
  /** `EXC-12`, `EXM-4`. */
  readonly reference: string;
  /** `null` pour un export d'avant la numérotation : pas de segment « k-sur-N ». */
  readonly part: ExportPart | null;
  readonly lineCount: number;
  /** `AAAA-MM-JJ` — le jour (Paris) de la préparation. */
  readonly preparedOn: string;
}

/** `CENET-EXC-12-comptes-1-sur-2-200-comptes-2026-10-23.csv` */
export function accountExportFileName(naming: BankExportFileNaming): string {
  return exportFileName(naming, "compte");
}

/** `CENET-EXM-4-mandats-1-sur-1-12-mandats-2026-10-23.csv` */
export function mandateExportFileName(naming: BankExportFileNaming): string {
  return exportFileName(naming, "mandat");
}

function exportFileName(naming: BankExportFileNaming, noun: string): string {
  const part =
    naming.part === null ? "" : `-${String(naming.part.rank)}-sur-${String(naming.part.count)}`;
  return `${PORTAL}-${naming.reference}-${noun}s${part}-${counted(naming.lineCount, noun)}-${naming.preparedOn}.csv`;
}

/** Ce qui nomme la remise pain.008 d'un lot — un fichier par schéma et échéance. */
export interface CollectionBatchFileNaming {
  /** `PRL-261031-M` — le code de la procédure. */
  readonly procedureCode: string;
  readonly scheme: string;
  /** `AAAA-MM-JJ`, ou `null` pour un lot d'avant le 2026-10-08 : pas de segment d'échéance. */
  readonly collectionDay: string | null;
  readonly debitCount: number;
}

/** `CENET-PRL-261031-M-B2B-echeance-2026-11-05-14-debits.xml` */
export function collectionBatchFileName(naming: CollectionBatchFileNaming): string {
  const due = naming.collectionDay === null ? "" : `-echeance-${naming.collectionDay}`;
  return `${PORTAL}-${naming.procedureCode}-${naming.scheme}${due}-${counted(naming.debitCount, "debit")}.xml`;
}

/** `1-compte`, `200-comptes`. */
function counted(count: number, noun: string): string {
  return `${String(count)}-${noun}${count > 1 ? "s" : ""}`;
}
