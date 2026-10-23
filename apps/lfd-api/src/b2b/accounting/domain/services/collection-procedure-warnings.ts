import type { LocalMoment } from "@lfd/contracts";

import { tightDepositMargin, type LocalDeadline } from "./collection-calendar.js";
import type { CollectionBatchStatus } from "../entities/collection-batch-status.js";

/**
 * **Les avertissements d'une procédure** — ceux que la page calculait déjà
 * (marge de dépôt, mandats non importés, retours en suspens), plus ceux que
 * la liste rend visibles d'un coup d'œil (limite passée, limite non réglée).
 * Un avertissement n'est jamais un refus. Pur.
 */
export type ProcedureWarningCode =
  | "deadline_passed"
  | "deadline_not_set"
  | "tight_deposit_margin"
  | "accounts_to_export"
  | "mandates_to_export"
  | "unmandated_debtors"
  | "pending_returns"
  | "missed_closure";

export interface ProcedureWarning {
  readonly code: ProcedureWarningCode;
  readonly count: number | null;
}

/** Ce qui reste à déposer, et depuis quand on le sait. */
export interface DepositToCome {
  /** `AAAA-MM-JJ` — préparation du lot, ou aujourd'hui s'il reste à préparer. */
  readonly fromDay: string;
  readonly deadline: LocalDeadline | null;
}

/**
 * La marge d'un lot préparé — `tightDepositMargin` depuis le jour (Paris) de
 * sa préparation : la même règle pour l'onglet 3 et pour la liste.
 */
export function preparedDepositMargin(
  status: CollectionBatchStatus,
  constitutedDay: string,
  deadline: LocalDeadline | null,
): number | null {
  return status === "constituted" ? tightDepositMargin(constitutedDay, deadline) : null;
}

/** La limite est-elle passée à `now` ? Jour et heure de Paris, comparés comme des chaînes. */
export function deadlinePassed(deadline: LocalDeadline, now: LocalMoment): boolean {
  return `${now.day}T${now.time}` > `${deadline.day}T${deadline.time}`;
}

/** Les avertissements d'un dépôt à venir : limite non réglée, passée, ou trop proche. */
export function depositWarnings(
  deposit: DepositToCome,
  now: LocalMoment,
): readonly ProcedureWarning[] {
  if (deposit.deadline === null) {
    return [{ code: "deadline_not_set", count: null }];
  }
  if (deadlinePassed(deposit.deadline, now)) {
    return [{ code: "deadline_passed", count: null }];
  }
  const margin = tightDepositMargin(deposit.fromDay, deposit.deadline);
  return margin === null ? [] : [{ code: "tight_deposit_margin", count: margin }];
}

/** Un avertissement compté, s'il compte quelque chose. */
export function countedWarning(
  code: ProcedureWarningCode,
  count: number,
): readonly ProcedureWarning[] {
  return count > 0 ? [{ code, count }] : [];
}
