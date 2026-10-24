import type { LocalMoment } from "@lfd/contracts";

import { BILLING_MODES, type BillingMode } from "../value-objects/billing-mode.js";
import type { LocalDeadline } from "./collection-calendar.js";
import {
  arrivalStepOf,
  fileStatus,
  followedAtClosure,
  openBatchesOf,
  returnsStatus,
  type ProcedureBatch,
  type ProcedureStepKey,
  type ProcedureStepState,
} from "./collection-procedure.js";
import { closureDayOf, procedureIdOf } from "./collection-procedure-id.js";
import { missedRow } from "./collection-procedure-missed-row.js";
import {
  countedWarning,
  depositWarnings,
  type ProcedureWarning,
} from "./collection-procedure-warnings.js";
import { isDeadBatchStatus } from "../entities/collection-batch-status.js";

/**
 * **La liste des procédures de prélèvement** (plan
 * `plan-page-procedure-de-prelevement.md`, § 11) : une ligne par clôture de
 * l'entité — ouvertes, à venir, closes récentes.
 *
 * Aucune règle n'est refaite : l'étape d'une ligne est celle que la page de
 * la procédure ouvrirait (`fileStatus`, `returnsStatus`, `arrivalStepOf`), le
 * lot suivi celui de la règle du § 4.3 (`openBatchesOf`). Pur.
 */

/**
 * `missed` : une clôture passée, plus ancienne que la dernière, que
 * l'automatisme n'a jamais tentée et qu'aucun lot ne couvre
 * (`missedClosures`, R4b — Hugo, 2026-10-23 : la table la montre en tête).
 */
export type ProcedurePhase = "open" | "upcoming" | "closed" | "missed";
export type ProcedureStage = ProcedureStepKey | "closed";

/** Un lot tel que la liste le lit : la procédure, plus de quoi avertir. */
export interface ListedBatch extends ProcedureBatch {
  /** `AAAA-MM-JJ` — le jour (Paris) de sa préparation. */
  readonly constitutedDay: string;
  readonly unmandatedCount: number;
  readonly periodLabel: string;
  readonly payerModes: readonly BillingMode[];
}

/** Une clôture sans lot (à préparer ou à venir), avec ses jalons du calendrier. */
export interface ClosureToCome {
  readonly closesAt: Date;
  readonly periodLabel: string;
  readonly modes: readonly BillingMode[];
  readonly collectionDay: string;
  readonly depositDeadline: LocalDeadline | null;
}

/** L'état d'un onglet de l'ENTITÉ, et ce qu'il reste à exporter. */
export interface EntityStep {
  readonly state: ProcedureStepState;
  readonly toExportCount: number;
}

export interface ProcedureListInput {
  readonly legalEntityId: string;
  readonly now: LocalMoment;
  readonly accounts: EntityStep;
  readonly mandates: EntityStep;
  readonly batches: readonly ListedBatch[];
  /** La dernière clôture, si aucun lot vivant ne la porte (`toPrepareOf`). */
  readonly toPrepare: ClosureToCome | null;
  /** Les clôtures manquées (`missedClosures`), la plus ancienne d'abord. */
  readonly missed: readonly ClosureToCome[];
  /** La prochaine clôture de chaque rythme suivi. */
  readonly upcoming: readonly ClosureToCome[];
  /** `AAAA-MM-JJ` — les closes d'avant ne sont pas listées ; `null` = aucune close. */
  readonly closedSince: string | null;
}

export interface ProcedureRow {
  readonly id: string;
  readonly closesAt: Date;
  readonly periodLabel: string;
  readonly modes: readonly BillingMode[];
  readonly phase: ProcedurePhase;
  readonly stage: ProcedureStage;
  readonly batches: readonly ListedBatch[];
  readonly followed: ListedBatch | null;
  readonly collectionDay: string | null;
  readonly depositDeadline: LocalDeadline | null;
  readonly warnings: readonly ProcedureWarning[];
}

/** Les lignes, dans l'ordre de la table (cf. {@link byUrgency}). */
export function procedureRowsOf(input: ProcedureListInput): readonly ProcedureRow[] {
  const groups = groupByClosure(input.batches);
  const rows = [...groups.values()].map((batches) => batchRow(input, batches));
  const known = new Set(rows.map((row) => row.id));
  const toCome = [
    ...input.missed.map((closure) => ({ closure, phase: "missed" as const })),
    ...(input.toPrepare === null ? [] : [{ closure: input.toPrepare, phase: "open" as const }]),
    ...input.upcoming.map((closure) => ({ closure, phase: "upcoming" as const })),
  ];
  for (const { closure, phase } of toCome) {
    const row = closureRow(input, closure, phase);
    if (!known.has(row.id)) {
      known.add(row.id);
      rows.push(row);
    }
  }
  return rows.filter((row) => listed(row, input.closedSince)).sort(byUrgency);
}

function listed(row: ProcedureRow, closedSince: string | null): boolean {
  return (
    row.phase !== "closed" || (closedSince !== null && closureDayOf(row.closesAt) >= closedSince)
  );
}

function groupByClosure(batches: readonly ListedBatch[]): ReadonlyMap<string, ListedBatch[]> {
  const groups = new Map<string, ListedBatch[]>();
  for (const batch of batches) {
    const day = closureDayOf(new Date(batch.cycleClosesAt));
    groups.set(day, [...(groups.get(day) ?? []), batch]);
  }
  return groups;
}

function batchRow(input: ProcedureListInput, batches: readonly ListedBatch[]): ProcedureRow {
  const today = input.now.day;
  const followed = followedAtClosure(batches, today, false);
  const closesAt = new Date(batches[0]?.cycleClosesAt ?? 0);
  const missed = input.missed.find(
    (closure) => closureDayOf(closure.closesAt) === closureDayOf(closesAt),
  );
  if (missed !== undefined && batches.every((batch) => isDeadBatchStatus(batch.status))) {
    // Ses lots sont annulés et aucun autre ne la couvre : elle reste manquée.
    return { ...closureRow(input, missed, "missed"), batches, followed };
  }
  const toPrepare = input.toPrepare;
  if (
    toPrepare !== null &&
    closureDayOf(toPrepare.closesAt) === closureDayOf(closesAt) &&
    batches.every((batch) => isDeadBatchStatus(batch.status))
  ) {
    // Tous ses lots sont annulés : la clôture est de nouveau « à préparer ».
    return { ...closureRow(input, toPrepare, "open"), batches, followed };
  }
  const open = openBatchesOf(batches, today).length > 0;
  return {
    id: procedureIdOf(input.legalEntityId, closesAt),
    closesAt,
    periodLabel: followed?.periodLabel ?? "",
    modes: modesOf(batches),
    phase: open ? "open" : "closed",
    stage: open ? stageOf(input, followed, false) : "closed",
    batches,
    followed,
    collectionDay: followed?.requestedCollectionDay ?? null,
    depositDeadline: followed?.depositDeadline ?? null,
    warnings: batchWarnings(input, batches, followed, open),
  };
}

function batchWarnings(
  input: ProcedureListInput,
  batches: readonly ListedBatch[],
  followed: ListedBatch | null,
  open: boolean,
): readonly ProcedureWarning[] {
  const deposit =
    followed?.status === "constituted"
      ? [
          ...depositWarnings(
            { fromDay: followed.constitutedDay, deadline: followed.depositDeadline },
            input.now,
          ),
          ...countedWarning("unmandated_debtors", followed.unmandatedCount),
        ]
      : [];
  const pending = batches.reduce((sum, batch) => sum + batch.pendingReturnCount, 0);
  return [
    ...deposit,
    ...(open ? entityWarnings(input) : []),
    ...countedWarning("pending_returns", pending),
  ];
}

function closureRow(
  input: ProcedureListInput,
  closure: ClosureToCome,
  phase: "open" | "upcoming" | "missed",
): ProcedureRow {
  if (phase === "missed") {
    return missedRow(input.legalEntityId, closure);
  }
  const deposit =
    phase === "open"
      ? depositWarnings({ fromDay: input.now.day, deadline: closure.depositDeadline }, input.now)
      : closure.depositDeadline === null
        ? [{ code: "deadline_not_set" as const, count: null }]
        : [];
  return {
    id: procedureIdOf(input.legalEntityId, closure.closesAt),
    closesAt: closure.closesAt,
    periodLabel: closure.periodLabel,
    modes: closure.modes,
    phase,
    stage: phase === "open" ? stageOf(input, null, true) : upcomingStageOf(input),
    batches: [],
    followed: null,
    collectionDay: closure.collectionDay,
    depositDeadline: closure.depositDeadline,
    warnings: [...deposit, ...entityWarnings(input)],
  };
}

/**
 * L'onglet que la page ouvrirait sur ce lot — la même règle (§ 1). Les
 * factures n'y entrent pas : la table ne lit pas l'assiette de chaque
 * clôture (une lecture de bons par ligne) ; elle dit l'étape bancaire, le
 * détail dit l'onglet « Factures » (2026-10-24).
 */
function stageOf(
  input: ProcedureListInput,
  followed: ProcedureBatch | null,
  toPrepare: boolean,
): ProcedureStage {
  return arrivalStepOf({
    accounts: input.accounts.state,
    mandates: input.mandates.state,
    invoices: "done",
    file: fileStatus(followed, toPrepare).state,
    returns: returnsStatus(followed, input.now.day).state,
  });
}

/** À venir : le fichier attend la clôture — les onglets de l'entité d'abord. */
function upcomingStageOf(input: ProcedureListInput): ProcedureStage {
  return arrivalStepOf({
    accounts: input.accounts.state,
    mandates: input.mandates.state,
    invoices: "locked",
    file: "waiting",
    returns: "locked",
  });
}

function entityWarnings(input: ProcedureListInput): readonly ProcedureWarning[] {
  return [
    ...countedWarning("accounts_to_export", input.accounts.toExportCount),
    ...countedWarning("mandates_to_export", input.mandates.toExportCount),
  ];
}

function modesOf(batches: readonly ListedBatch[]): readonly BillingMode[] {
  const modes = new Set(batches.flatMap((batch) => batch.payerModes));
  return BILLING_MODES.filter((mode) => modes.has(mode));
}

/**
 * L'ordre de la table : d'abord les clôtures manquées, la plus ancienne en
 * tête (Hugo, 2026-10-23) ; puis ce qui reste à déposer (ouvertes non
 * déposées et à venir), la limite la plus proche en tête — une limite ne se
 * rattrape pas ; puis les déposées encore suivies, l'échéance la plus proche
 * en tête ; les closes à la fin, la plus récente d'abord. Même priorité que
 * les lots ouverts de la page (Q4).
 */
function byUrgency(left: ProcedureRow, right: ProcedureRow): number {
  const rank = rankOf(left) - rankOf(right);
  if (rank !== 0) {
    return rank;
  }
  if (left.phase === "closed") {
    return right.closesAt.getTime() - left.closesAt.getTime();
  }
  return urgencyKey(left).localeCompare(urgencyKey(right));
}

const RANK_MISSED = -1;
const RANK_TO_DEPOSIT = 0;
const RANK_DEPOSITED = 1;
const RANK_CLOSED = 2;

function rankOf(row: ProcedureRow): number {
  if (row.phase === "missed") {
    return RANK_MISSED;
  }
  if (row.phase === "closed") {
    return RANK_CLOSED;
  }
  return row.followed?.status === "deposited" ? RANK_DEPOSITED : RANK_TO_DEPOSIT;
}

function urgencyKey(row: ProcedureRow): string {
  if (row.followed?.status !== "deposited" && row.depositDeadline !== null) {
    return `${row.depositDeadline.day}T${row.depositDeadline.time}`;
  }
  return row.collectionDay ?? closureDayOf(row.closesAt);
}
