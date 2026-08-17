import type { PriceFloorView, PriceRuleView } from "@lfd/contracts";

import { CorruptedPriceFloorError, CorruptedPriceRuleError } from "../domain/pricing-errors.js";
import {
  PRICE_STAGES,
  type PriceAlteration,
  type PriceRule,
  type PriceScopeType,
  type ScopedPriceFloor,
} from "../domain/price-rule.js";

/**
 * **Ligne de base → domaine, et ligne → vue.** Écrit une fois, ici.
 *
 * Trois adaptateurs lisent ces deux tables — la résolution de prix, la
 * résolution du plancher, l'écran de paramétrage. Trois conversions auraient
 * fini par diverger sur le cas qui compte : celui d'un discriminant inattendu,
 * qu'une des trois aurait laissé passer.
 *
 * Les discriminants sont des `String` en base (ils entrent dans une contrainte
 * d'exclusion GiST, où un type énuméré ajouterait une dépendance à `btree_gist`
 * sans rien apporter). Une valeur inconnue **lève** : une règle illisible qu'on
 * ignorerait facturerait un prix que personne n'a décidé, et sans trace.
 */

export interface RuleRow {
  readonly id: string;
  readonly stage: string;
  readonly nature: string;
  readonly scopeType: string;
  readonly scopeId: string | null;
  readonly audienceType: string;
  readonly audienceId: string | null;
  readonly minQuantity: number | null;
  readonly amountCents: number | null;
  readonly direction: string | null;
  readonly mode: string | null;
  readonly value: number | null;
  readonly validFrom: Date;
  readonly validTo: Date | null;
  readonly label: string;
  readonly createdBy: string;
  readonly createdAt: Date;
}

export interface FloorRow {
  readonly id: string;
  readonly scopeType: string;
  readonly scopeId: string | null;
  readonly mode: string;
  readonly value: number;
  readonly createdBy: string;
  readonly updatedAt: Date;
}

const SCOPE_TYPES: readonly PriceScopeType[] = ["global", "category", "product", "variant"];
const AUDIENCE_TYPES = ["all", "segment", "company"] as const;

export function ruleFromRow(row: RuleRow): PriceRule {
  const common = {
    id: row.id,
    stage: expect(row.id, "stage", row.stage, PRICE_STAGES),
    scope: { type: expect(row.id, "scopeType", row.scopeType, SCOPE_TYPES), id: row.scopeId },
    audience: {
      type: expect(row.id, "audienceType", row.audienceType, AUDIENCE_TYPES),
      id: row.audienceId,
    },
    minQuantity: row.minQuantity,
    validFrom: row.validFrom,
    validTo: row.validTo,
    label: row.label,
  } as const;

  if (row.nature === "replace") {
    if (row.amountCents === null) {
      throw new CorruptedPriceRuleError(row.id, "amountCents manquant sur une règle « replace »");
    }
    return { ...common, nature: "replace", amountCents: row.amountCents };
  }
  if (row.nature === "alter") {
    return { ...common, nature: "alter", alteration: alterationOf(row) };
  }
  throw new CorruptedPriceRuleError(row.id, `nature inconnue « ${row.nature} »`);
}

/** La même ligne, telle que l'écran la lit — avec sa provenance. */
export function ruleViewFromRow(row: RuleRow): PriceRuleView {
  const rule = ruleFromRow(row);
  return {
    id: rule.id,
    stage: rule.stage,
    scope: rule.scope,
    audience: rule.audience,
    minQuantity: rule.minQuantity,
    effect:
      rule.nature === "replace"
        ? { nature: "replace", amountCents: rule.amountCents }
        : {
            nature: "alter",
            direction: rule.alteration.direction,
            mode: rule.alteration.mode,
            value: magnitudeOf(rule.alteration),
          },
    label: rule.label,
    validFrom: rule.validFrom.toISOString(),
    validTo: rule.validTo?.toISOString() ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export function floorFromRow(row: FloorRow): ScopedPriceFloor {
  const scopeType = SCOPE_TYPES.find((candidate) => candidate === row.scopeType);
  if (scopeType === undefined) {
    throw new CorruptedPriceFloorError(row.id, `portée inattendue « ${row.scopeType} »`);
  }
  if (row.mode !== "percent" && row.mode !== "amount") {
    throw new CorruptedPriceFloorError(row.id, `unité inconnue « ${row.mode} »`);
  }
  return {
    id: row.id,
    scope: { type: scopeType, id: row.scopeId },
    floor:
      row.mode === "percent"
        ? { mode: "percent", bp: row.value }
        : { mode: "amount", cents: row.value },
  };
}

export function floorViewFromRow(row: FloorRow): PriceFloorView {
  const floor = floorFromRow(row);
  return {
    id: floor.id,
    scope: floor.scope,
    mode: floor.floor.mode,
    value: row.value,
    createdBy: row.createdBy,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function magnitudeOf(alteration: PriceAlteration): number {
  return alteration.mode === "percent" ? alteration.bp : alteration.cents;
}

function alterationOf(row: RuleRow): PriceAlteration {
  if (row.value === null || (row.direction !== "increase" && row.direction !== "decrease")) {
    throw new CorruptedPriceRuleError(row.id, "sens ou grandeur manquants sur une règle « alter »");
  }
  if (row.mode === "percent") {
    return { direction: row.direction, mode: "percent", bp: row.value };
  }
  if (row.mode === "amount") {
    return { direction: row.direction, mode: "amount", cents: row.value };
  }
  throw new CorruptedPriceRuleError(row.id, `unité inconnue « ${String(row.mode)} »`);
}

/** Vérifie qu'une chaîne de la base appartient bien à l'union du domaine. */
function expect<T extends string>(
  rowId: string,
  field: string,
  value: string,
  allowed: readonly T[],
): T {
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) {
    throw new CorruptedPriceRuleError(rowId, `${field} : valeur inattendue « ${value} »`);
  }
  return match;
}
