import type { ImportedReturnStatusView } from "@lfd/contracts";

import { AppError } from "../../../platform/shared/errors/app-error.js";
import { CollectionReturn, type ReturnableLine } from "../domain/entities/collection-return.js";
import type {
  CollectionTestReturnTarget,
  CollectionTestReturnTargetsReader,
} from "../domain/ports/collection-test-return-targets.reader.js";
import type { ReturnableLinesReader } from "../domain/ports/returnable-lines.reader.js";
import type { BankFileEntry, BankReturnFile } from "../domain/services/bank-return-file.js";
import { isTestReference } from "../domain/services/collection-test-identifiers.js";
import { normalizedFileReason } from "../domain/value-objects/bank-return-reason.js";
import type { ReturnEntry } from "./collection-return-support.js";

/** Une transaction du fichier, appariée (ou non) à sa ligne, et ce qu'on en ferait. */
export interface ClassifiedReturn {
  readonly entry: BankFileEntry;
  /** Le motif ramené à ce que l'agrégat admet. */
  readonly reason: { readonly code: string; readonly label: string | null };
  readonly line: ReturnableLine | null;
  /** L'essai qu'une référence `ESS-…` désigne — jamais en même temps qu'une ligne. */
  readonly test: CollectionTestReturnTarget | null;
  readonly status: ImportedReturnStatusView;
  readonly problem: string | null;
}

/** Les deux lectures qu'un appariement demande. */
export interface ReturnMatchReaders {
  readonly lines: ReturnableLinesReader;
  readonly tests: CollectionTestReturnTargetsReader;
}

/** L'auteur d'un essai à blanc : rien n'est écrit, seuls les refus comptent. */
const DRY_RUN_ID = "dry-run";

/**
 * **Apparie un fichier de retours** (R5b) par `EndToEndId`, puis fait juger
 * chaque transaction appariée par l'AGRÉGAT, à blanc : l'aperçu et la
 * confirmation disent ce que la saisie à la main dirait, sans seconde règle.
 *
 * 🔴 Une référence `ESS-…` est celle d'un prélèvement d'essai (plan
 * `plan-prelevement-d-essai.md`) : elle n'est cherchée QUE parmi les essais,
 * jamais parmi les lignes de lot — un essai ne touche jamais un lot réel.
 */
export async function classifyReturns(
  readers: ReturnMatchReaders,
  file: BankReturnFile,
  at: Date,
): Promise<readonly ClassifiedReturn[]> {
  const ids = file.entries.map((entry) => entry.endToEndId);
  const lineIds = ids.filter((id) => !isTestReference(id));
  const [matched, returned, tests] = await Promise.all([
    readers.lines.byEndToEndIds(lineIds),
    readers.lines.alreadyReturned(lineIds),
    readers.tests.byEndToEndIds(ids.filter(isTestReference)),
  ]);
  const seen = new Set<string>();
  return file.entries.map((entry) => {
    const reason = normalizedFileReason(entry.kind, entry.reasonCode, entry.reasonLabel);
    const duplicate = seen.has(entry.endToEndId);
    seen.add(entry.endToEndId);
    if (isTestReference(entry.endToEndId)) {
      const test = tests.get(entry.endToEndId) ?? null;
      return { entry, reason, line: null, test, ...testVerdict(entry, test, duplicate) };
    }
    const line = matched.get(entry.endToEndId) ?? null;
    const already = returned.has(entry.endToEndId) || duplicate;
    const judged = verdict({ entry, reason, line, format: file.format, at }, already);
    return { entry, reason, line, test: null, ...judged };
  });
}

/** Une transaction `ESS-…` : rattachée à son essai, ou dite pourquoi pas. */
function testVerdict(
  entry: BankFileEntry,
  test: CollectionTestReturnTarget | null,
  duplicate: boolean,
): Pick<ClassifiedReturn, "status" | "problem"> {
  if (test === null) {
    return { status: "unknown", problem: "aucun prélèvement d'essai ne porte cette référence" };
  }
  if (test.returned || duplicate) {
    return { status: "already_returned", problem: "un retour est déjà rattaché à cet essai" };
  }
  if (entry.amountCents !== test.amountCents) {
    return { status: "amount_mismatch", problem: "le montant diffère de celui de l'essai" };
  }
  return { status: "collection_test", problem: null };
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
