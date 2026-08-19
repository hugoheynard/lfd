import type { VolumeCommitmentView } from "@lfd/contracts";

import { CorruptedPriceRuleError } from "../domain/pricing-errors.js";
import type { VolumeCommitmentState } from "../domain/entities/volume-commitment.js";
import type { PriceScopeType } from "../domain/price-rule.js";

/** La ligne telle que Prisma la rend — le contrat de conversion, écrit une fois. */
export interface CommitmentRow {
  readonly id: string;
  readonly companyId: string;
  readonly scopeType: string;
  readonly scopeId: string | null;
  readonly promisedQuantity: number;
  readonly validFrom: Date;
  readonly validTo: Date;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly archivedAt: Date | null;
  readonly archivedBy: string | null;
  readonly archiveReason: string | null;
}

const SCOPE_TYPES: readonly PriceScopeType[] = ["global", "category", "product", "variant"];

/**
 * Une portée inconnue **lève** plutôt que d'être ignorée : un engagement
 * illisible qu'on écarterait ferait payer le tarif d'entrée à un client qui a
 * négocié, sans que rien ne le signale.
 */
export function commitmentStateFromRow(row: CommitmentRow): VolumeCommitmentState {
  const scopeType = SCOPE_TYPES.find((candidate) => candidate === row.scopeType);
  if (scopeType === undefined) {
    throw new CorruptedPriceRuleError(row.id, `portée inattendue « ${row.scopeType} »`);
  }
  return {
    id: row.id,
    companyId: row.companyId,
    scope: { type: scopeType, id: row.scopeId },
    promisedQuantity: row.promisedQuantity,
    validFrom: row.validFrom,
    validTo: row.validTo,
    createdBy: row.createdBy,
    archivedAt: row.archivedAt,
    archivedBy: row.archivedBy,
    archiveReason: row.archiveReason,
  };
}

/**
 * La même ligne, telle que l'écran la lit.
 *
 * `orderedQuantity` est **mesuré** et passé par l'appelant : ce fichier convertit
 * des lignes, il n'interroge pas les commandes. C'est aussi ce qui garde le
 * suivi honnête — le volume atteint n'est jamais dérivé de la promesse.
 */
export function commitmentViewFromRow(
  row: CommitmentRow,
  orderedQuantity: number,
): VolumeCommitmentView {
  const state = commitmentStateFromRow(row);
  return {
    id: state.id,
    companyId: state.companyId,
    scope: state.scope,
    promisedQuantity: state.promisedQuantity,
    validFrom: state.validFrom.toISOString(),
    validTo: state.validTo.toISOString(),
    createdBy: state.createdBy,
    createdAt: row.createdAt.toISOString(),
    archivedAt: state.archivedAt?.toISOString() ?? null,
    archivedBy: state.archivedBy,
    archiveReason: state.archiveReason,
    orderedQuantity,
  };
}
