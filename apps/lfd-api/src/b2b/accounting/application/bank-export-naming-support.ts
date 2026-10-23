import { instantToLocal } from "@lfd/contracts";

import type { ExportPart } from "../domain/services/bank-export-reference.js";
import {
  accountExportFileName,
  mandateExportFileName,
} from "../domain/services/bank-file-names.js";

/** Ce qu'un export a figé à sa préparation et qui le nomme. */
interface NamedExport {
  readonly reference: string;
  readonly part: ExportPart | null;
  readonly createdAt: Date;
}

/** Le nom du fichier d'un export des comptes — le jour est celui de la préparation, à Paris. */
export function accountExportFileNameOf(
  row: NamedExport & { readonly accountCount: number },
): string {
  return accountExportFileName({
    reference: row.reference,
    part: row.part,
    lineCount: row.accountCount,
    preparedOn: instantToLocal(row.createdAt).day,
  });
}

/** Le nom du fichier d'un export des mandats. */
export function mandateExportFileNameOf(
  row: NamedExport & { readonly mandateCount: number },
): string {
  return mandateExportFileName({
    reference: row.reference,
    part: row.part,
    lineCount: row.mandateCount,
    preparedOn: instantToLocal(row.createdAt).day,
  });
}
