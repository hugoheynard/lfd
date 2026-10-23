import type {
  BankReturnCheckView,
  CollectionProcedureReturnFiguresView,
  CollectionProcedureReturnsView,
} from "@lfd/contracts";

import type { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import type { CollectionReturnsReader } from "../domain/ports/collection-returns.reader.js";
import {
  standingCheckOf,
  type BankReturnCheckLine,
} from "../domain/services/bank-return-checks.js";
import { returnsStatus, type ProcedureBatch } from "../domain/services/collection-procedure.js";

/** Ce que l'onglet 4 lit en plus de l'état : les retours du lot, et qui a attesté. */
export interface ReturnsStepReaders {
  readonly returns: CollectionReturnsReader;
  readonly authors: StaffAuthorDirectory;
}

/** Ce que l'onglet 4 sait du lot suivi et de l'entité. */
export interface ReturnsStepInput {
  readonly followed: ProcedureBatch | null;
  /** Les lignes du lot suivi ; `null` sans lot. */
  readonly lineCount: number | null;
  /** Les lignes « Retours contrôlés » de l'entité. */
  readonly checks: readonly BankReturnCheckLine[];
  readonly today: string;
}

/**
 * **L'onglet 4** (plan `plan-page-procedure-de-prelevement.md` § 3.4, P3) :
 * l'état (`returnsStatus`, qui lit les jours attestés), les jours manquants,
 * l'attestation d'aujourd'hui qui fait foi, et les chiffres clés du lot.
 */
export async function readReturnsStep(
  readers: ReturnsStepReaders,
  input: ReturnsStepInput,
): Promise<CollectionProcedureReturnsView> {
  const { followed, today } = input;
  const status = returnsStatus(followed, today);
  const [todayCheck, figures] = await Promise.all([
    todayCheckOf(readers.authors, input.checks, today),
    followed?.status === "deposited"
      ? figuresOf(readers.returns, followed.id, input.lineCount ?? 0)
      : Promise.resolve(null),
  ]);
  return {
    ...status,
    pendingReturnCount: followed?.pendingReturnCount ?? 0,
    today,
    todayCheck,
    figures,
  };
}

async function todayCheckOf(
  authors: StaffAuthorDirectory,
  checks: readonly BankReturnCheckLine[],
  today: string,
): Promise<BankReturnCheckView | null> {
  const standing = standingCheckOf(checks.filter((line) => line.day === today));
  if (standing === null) {
    return null;
  }
  const names = await authors.identify([standing.staffId]);
  return { day: today, at: standing.at.toISOString(), byName: names.nameOf(standing.staffId) };
}

async function figuresOf(
  returns: CollectionReturnsReader,
  batchId: string,
  lineCount: number,
): Promise<CollectionProcedureReturnFiguresView> {
  const rows = await returns.ofBatch(batchId);
  const count = (resolution: (typeof rows)[number]["resolution"]): number =>
    rows.filter((row) => row.resolution === resolution).length;
  return {
    lineCount,
    pendingCount: count("pending"),
    representedCount: count("represented"),
    settledOtherwiseCount: count("settled_otherwise"),
    writtenOffCount: count("written_off"),
  };
}
