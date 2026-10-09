import type { ImportedReturnStatusView } from "@lfd/contracts";

import { AppError } from "../../../platform/shared/errors/app-error.js";
import { CollectionReturn, type ReturnableLine } from "../domain/entities/collection-return.js";
import type { ReturnableLinesReader } from "../domain/ports/returnable-lines.reader.js";
import type { BankFileEntry, BankReturnFile } from "../domain/services/bank-return-file.js";
import { normalizedFileReason } from "../domain/value-objects/bank-return-reason.js";
import type { ReturnEntry } from "./collection-return-support.js";

/** Une transaction du fichier, appariée (ou non) à sa ligne, et ce qu'on en ferait. */
export interface ClassifiedReturn {
  readonly entry: BankFileEntry;
  /** Le motif ramené à ce que l'agrégat admet. */
  readonly reason: { readonly code: string; readonly label: string | null };
  readonly line: ReturnableLine | null;
  readonly status: ImportedReturnStatusView;
  readonly problem: string | null;
}

/** L'auteur d'un essai à blanc : rien n'est écrit, seuls les refus comptent. */
const DRY_RUN_ID = "dry-run";

/**
 * **Apparie un fichier de retours** (R5b) par `EndToEndId`, puis fait juger
 * chaque transaction appariée par l'AGRÉGAT, à blanc : l'aperçu et la
 * confirmation disent ce que la saisie à la main dirait, sans seconde règle.
 */
export async function classifyReturns(
  lines: ReturnableLinesReader,
  file: BankReturnFile,
  at: Date,
): Promise<readonly ClassifiedReturn[]> {
  const ids = file.entries.map((entry) => entry.endToEndId);
  const [matched, returned] = await Promise.all([
    lines.byEndToEndIds(ids),
    lines.alreadyReturned(ids),
  ]);
  const seen = new Set<string>();
  return file.entries.map((entry) => {
    const reason = normalizedFileReason(entry.kind, entry.reasonCode, entry.reasonLabel);
    const line = matched.get(entry.endToEndId) ?? null;
    const duplicate = seen.has(entry.endToEndId);
    seen.add(entry.endToEndId);
    const already = returned.has(entry.endToEndId) || duplicate;
    const judged = verdict({ entry, reason, line, format: file.format, at }, already);
    return { entry, reason, line, ...judged };
  });
}

interface Judged {
  readonly entry: BankFileEntry;
  readonly reason: ClassifiedReturn["reason"];
  readonly line: ReturnableLine | null;
  readonly format: BankReturnFile["format"];
  readonly at: Date;
}

function verdict(
  { entry, reason, line, format, at }: Judged,
  alreadyReturned: boolean,
): Pick<ClassifiedReturn, "status" | "problem"> {
  if (line === null) {
    return { status: "unknown", problem: "aucune ligne de nos lots ne porte cette référence" };
  }
  if (alreadyReturned) {
    return {
      status: "already_returned",
      problem: "un retour est déjà enregistré pour cette ligne",
    };
  }
  if (entry.amountCents !== line.amountCents) {
    return { status: "amount_mismatch", problem: "le montant diffère de celui de la ligne" };
  }
  try {
    const recorded = { at, staffId: DRY_RUN_ID };
    CollectionReturn.record(
      { id: DRY_RUN_ID, recorded, ...returnEntryOf(entry, reason, format) },
      line,
      false,
    );
  } catch (error) {
    if (error instanceof AppError) {
      return { status: "not_returnable", problem: error.message };
    }
    throw error;
  }
  return { status: "matched", problem: null };
}

/** Ce que la confirmation enregistre pour une transaction appariée. */
export function returnEntryOf(
  entry: BankFileEntry,
  reason: ClassifiedReturn["reason"],
  source: BankReturnFile["format"],
): ReturnEntry {
  return {
    kind: entry.kind,
    reasonCode: reason.code,
    reasonLabel: reason.label,
    returnedOn: entry.returnedOn,
    amountCents: entry.amountCents,
    feeCents: null,
    source,
  };
}
