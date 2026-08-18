import { volumeTiersSchema } from "@lfd/contracts";

import { CorruptedVolumeLadderError } from "../domain/pricing-errors.js";
import { statusOf, suspendedFromOf, type RuleLifecycle } from "../domain/rule-lifecycle.js";
import type { VolumeLadderState } from "../domain/entities/volume-ladder.js";
import type { PriceAudienceType, PriceScopeType } from "../domain/price-rule.js";
import type { VolumeLadder, VolumeLadderUnit } from "../domain/volume-ladder.js";
import type { VolumeLadderView } from "@lfd/contracts";

/**
 * **Ligne de base → domaine, et ligne → vue.** Écrit une fois, ici.
 *
 * Les paliers arrivent en JSON : ils ont été écrits par une version du code et
 * se relisent par une autre, des mois plus tard. Le schéma zod est la seule
 * barrière entre les deux — et une échelle illisible **lève** plutôt que de se
 * rabattre sur un défaut, parce qu'un barème ignoré facturerait un prix que
 * personne n'a décidé.
 */

export interface LadderRow {
  readonly id: string;
  readonly scopeType: string;
  readonly scopeId: string | null;
  readonly audienceType: string;
  readonly audienceId: string | null;
  readonly unit: string;
  readonly tiers: unknown;
  readonly label: string;
  readonly validFrom: Date;
  readonly validTo: Date | null;
  readonly createdBy: string;
  readonly pausedAt: Date | null;
  readonly pausedBy: string | null;
  readonly archivedAt: Date | null;
  readonly archivedBy: string | null;
  readonly archiveReason: string | null;
}

const SCOPE_TYPES: readonly PriceScopeType[] = ["global", "category", "product", "variant"];
const AUDIENCE_TYPES: readonly PriceAudienceType[] = ["all", "segment", "company"];
const UNITS: readonly VolumeLadderUnit[] = ["percent", "amount"];

export function ladderFromRow(row: LadderRow): VolumeLadder {
  const state = ladderStateFromRow(row);
  return {
    id: state.id,
    scope: state.scope,
    audience: state.audience,
    unit: state.unit,
    tiers: state.tiers,
    label: state.label,
    validFrom: state.validFrom,
    validTo: state.validTo,
    suspendedFrom: suspendedFromOf(state.lifecycle),
  };
}

/** La ligne telle que l'**agrégat** la reprend — pour lui appliquer une transition. */
export function ladderStateFromRow(row: LadderRow): VolumeLadderState {
  const tiers = volumeTiersSchema.safeParse(row.tiers);
  if (!tiers.success) {
    throw new CorruptedVolumeLadderError(row.id, "paliers illisibles");
  }
  return {
    id: row.id,
    scope: { type: expect(row.id, "scopeType", row.scopeType, SCOPE_TYPES), id: row.scopeId },
    audience: {
      type: expect(row.id, "audienceType", row.audienceType, AUDIENCE_TYPES),
      id: row.audienceId,
    },
    unit: expect(row.id, "unit", row.unit, UNITS),
    tiers: tiers.data,
    label: row.label,
    validFrom: row.validFrom,
    validTo: row.validTo,
    createdBy: row.createdBy,
    lifecycle: lifecycleOf(row),
  };
}

/** La même ligne, telle que l'écran la lit — avec son état et sa provenance. */
export function ladderViewFromRow(row: LadderRow): VolumeLadderView {
  const state = ladderStateFromRow(row);
  return {
    id: state.id,
    scope: state.scope,
    audience: state.audience,
    unit: state.unit,
    tiers: state.tiers,
    label: state.label,
    validFrom: state.validFrom.toISOString(),
    validTo: state.validTo?.toISOString() ?? null,
    createdBy: state.createdBy,
    status: statusOf(state.lifecycle),
  };
}

function lifecycleOf(row: LadderRow): RuleLifecycle {
  return {
    pausedAt: row.pausedAt,
    pausedBy: row.pausedBy,
    archivedAt: row.archivedAt,
    archivedBy: row.archivedBy,
    archiveReason: row.archiveReason,
  };
}

/**
 * Un discriminant inattendu **lève**. Les colonnes sont des `String` en base
 * (elles entrent dans une contrainte d'exclusion GiST) : rien n'empêche
 * techniquement une valeur inconnue d'y entrer par une migration ou un import.
 */
function expect<T extends string>(
  id: string,
  field: string,
  value: string,
  allowed: readonly T[],
): T {
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) {
    throw new CorruptedVolumeLadderError(id, `${field} inconnu « ${value} »`);
  }
  return match;
}
