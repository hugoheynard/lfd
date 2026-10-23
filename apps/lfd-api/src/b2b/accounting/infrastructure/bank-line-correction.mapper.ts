import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import {
  BANK_LINE_CORRECTIONS,
  isBankLineCorrectionKind,
  type BankLineCorrection,
} from "../domain/entities/bank-line-correction.js";

/** Les quatre colonnes d'une correction, telles que les deux tables de lignes les portent. */
export interface BankLineCorrectionColumns {
  readonly correctedAs: string | null;
  readonly correctedAt: Date | null;
  readonly correctedByStaffId: string | null;
  readonly rejectionReason: string | null;
}

/** Une valeur que le CHECK de la base aurait dû refuser : la ligne est illisible. */
class UnreadableBankLineCorrectionError extends TechnicalError {
  constructor(value: string) {
    super(
      "accounting.bank_report.unreadable_correction",
      `Une ligne d'export porte la correction « ${value} », que le code ne connaît pas. Vérifier la contrainte « *_correction_kind » de la table.`,
    );
  }
}

/** Colonnes → correction ; `null` quand la ligne n'en porte pas. */
export function correctionFromRow(row: BankLineCorrectionColumns): BankLineCorrection | null {
  if (row.correctedAs === null || row.correctedAt === null || row.correctedByStaffId === null) {
    return null;
  }
  if (!isBankLineCorrectionKind(row.correctedAs)) {
    throw new UnreadableBankLineCorrectionError(row.correctedAs);
  }
  return {
    kind: row.correctedAs,
    stamp: { at: row.correctedAt, staffId: row.correctedByStaffId },
    rejectionReason: row.rejectionReason,
  };
}

/** Correction → colonnes. */
export function correctionToRow(correction: BankLineCorrection | null): BankLineCorrectionColumns {
  return {
    correctedAs: correction?.kind ?? null,
    correctedAt: correction?.stamp.at ?? null,
    correctedByStaffId: correction?.stamp.staffId ?? null,
    rejectionReason: correction?.rejectionReason ?? null,
  };
}

/**
 * Une ligne rejetée par le compte rendu CENET ne compte ni pour connue ni pour
 * en vol : son compte redevient « à exporter » (Hugo, 2026-10-23). Écrit en
 * `OR` : `not` seul écarterait aussi les lignes sans correction (NULL).
 */
export const NOT_REJECTED = {
  OR: [{ correctedAs: null }, { correctedAs: { not: BANK_LINE_CORRECTIONS.rejected } }],
};
