import type { PriceFloorView, PriceRuleView } from "@lfd/contracts";

import type { PricingRuleState } from "../domain/entities/pricing-rule.js";

import { CorruptedPriceFloorError, CorruptedPriceRuleError } from "../domain/pricing-errors.js";
import { floorDrift } from "../domain/floor-drift.js";
import { statusOf, suspendedFromOf, type RuleLifecycle } from "../domain/rule-lifecycle.js";
import type { DynamicFloor } from "../domain/floor-policy.js";
import {
  PRICE_STAGES,
  type PriceAlteration,
  type PriceFloor,
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
  readonly amountMillicents: number | null;
  readonly direction: string | null;
  readonly mode: string | null;
  readonly value: number | null;
  readonly validFrom: Date;
  readonly validTo: Date | null;
  readonly label: string;
  readonly stacksOverMercuriale: boolean;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly pausedAt: Date | null;
  readonly pausedBy: string | null;
  readonly archivedAt: Date | null;
  readonly archivedBy: string | null;
  readonly archiveReason: string | null;
}

export interface FloorRow {
  readonly id: string;
  readonly scopeType: string;
  readonly scopeId: string | null;
  readonly mode: string;
  readonly value: number;
  readonly dynamicMode: string | null;
  readonly dynamicValue: number | null;
  readonly unlockMinQuantity: number | null;
  readonly unlockMinVolumeRatioBp: number | null;
  readonly referenceCanonicalMillicents: number | null;
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
    // Le calcul ne distingue pas la pause de l'archivage : les deux disent
    // « cette règle n'agit plus ». Le PLUS TÔT gagne — une règle suspendue puis
    // archivée a cessé d'agir à la pause.
    suspendedFrom: suspendedFromOf(lifecycleFromRow(row)),
    label: row.label,
    stacksOverMercuriale: row.stacksOverMercuriale,
  } as const;

  if (row.nature === "replace") {
    if (row.amountMillicents === null) {
      throw new CorruptedPriceRuleError(
        row.id,
        "amountMillicents manquant sur une règle « replace »",
      );
    }
    return { ...common, nature: "replace", amountMillicents: row.amountMillicents };
  }
  if (row.nature === "alter") {
    return { ...common, nature: "alter", alteration: alterationOf(row) };
  }
  throw new CorruptedPriceRuleError(row.id, `nature inconnue « ${row.nature} »`);
}

/** Les cinq colonnes du cycle de vie, réunies en une valeur. */
export function lifecycleFromRow(row: RuleRow): RuleLifecycle {
  return {
    pausedAt: row.pausedAt,
    pausedBy: row.pausedBy,
    archivedAt: row.archivedAt,
    archivedBy: row.archivedBy,
    archiveReason: row.archiveReason,
  };
}

/**
 * La ligne telle que l'**agrégat** la reprend — pour lui appliquer une
 * transition.
 *
 * Passe par `ruleFromRow`, donc par ses refus de discriminant : une ligne
 * illisible lève ici aussi, plutôt que de rendre un agrégat sur lequel on
 * pourrait ensuite écrire.
 */
export function ruleStateFromRow(row: RuleRow): PricingRuleState {
  const rule = ruleFromRow(row);
  return {
    id: rule.id,
    stage: rule.stage,
    scope: rule.scope,
    audience: rule.audience,
    minQuantity: rule.minQuantity,
    effect:
      rule.nature === "replace"
        ? { nature: "replace", amountMillicents: rule.amountMillicents }
        : { nature: "alter", alteration: rule.alteration },
    label: rule.label,
    stacksOverMercuriale: rule.stacksOverMercuriale,
    validFrom: rule.validFrom,
    validTo: rule.validTo,
    createdBy: row.createdBy,
    lifecycle: lifecycleFromRow(row),
  };
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
        ? { nature: "replace", amountMillicents: rule.amountMillicents }
        : {
            nature: "alter",
            direction: rule.alteration.direction,
            mode: rule.alteration.mode,
            value: magnitudeOf(rule.alteration),
          },
    label: rule.label,
    stacksOverMercuriale: rule.stacksOverMercuriale,
    validFrom: rule.validFrom.toISOString(),
    validTo: rule.validTo?.toISOString() ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    status: statusOf(lifecycleFromRow(row)),
    pausedAt: row.pausedAt?.toISOString() ?? null,
    pausedBy: row.pausedBy,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    archivedBy: row.archivedBy,
    archiveReason: row.archiveReason,
  };
}

export function floorFromRow(row: FloorRow): ScopedPriceFloor {
  const scopeType = SCOPE_TYPES.find((candidate) => candidate === row.scopeType);
  if (scopeType === undefined) {
    throw new CorruptedPriceFloorError(row.id, `portée inattendue « ${row.scopeType} »`);
  }
  return {
    id: row.id,
    scope: { type: scopeType, id: row.scopeId },
    policy: { hard: floorOf(row.id, row.mode, row.value), dynamic: dynamicOf(row) },
  };
}

/** Une grandeur + son unité → un plancher. */
function floorOf(rowId: string, mode: string, value: number): PriceFloor {
  if (mode === "percent") {
    return { mode: "percent", bp: value };
  }
  if (mode === "amount") {
    return { mode: "amount", millicents: value };
  }
  throw new CorruptedPriceFloorError(rowId, `unité inconnue « ${mode} »`);
}

/**
 * La porte, ou `null`.
 *
 * Une porte **sans clé** est refusée plutôt qu'ignorée : elle serait un mur plus
 * bas, le plancher dur ne servirait plus à rien, et personne ne verrait qu'il a
 * été contourné. La base l'interdit aussi par un `CHECK` — ceci est la seconde
 * barrière, celle qui tient quand la donnée n'a pas traversé l'agrégat.
 */
function dynamicOf(row: FloorRow): DynamicFloor | null {
  if (row.dynamicMode === null || row.dynamicValue === null) {
    return null;
  }
  if (row.unlockMinQuantity === null && row.unlockMinVolumeRatioBp === null) {
    throw new CorruptedPriceFloorError(row.id, "plancher dynamique sans condition d'ouverture");
  }
  return {
    floor: floorOf(row.id, row.dynamicMode, row.dynamicValue),
    unlock: {
      minQuantity: row.unlockMinQuantity,
      minVolumeRatioBp: row.unlockMinVolumeRatioBp,
    },
  };
}

/**
 * @param currentCanonicalMillicents le tarif représentatif **d'aujourd'hui** pour la
 *   portée visée, ou `null` si l'appelant ne sait pas le calculer. Passé plutôt
 *   que lu ici : ce fichier convertit des lignes, il n'interroge pas le catalogue.
 */
export function floorViewFromRow(
  row: FloorRow,
  currentCanonicalMillicents: number | null = null,
  now: Date = new Date(),
): PriceFloorView {
  const scoped = floorFromRow(row);
  const dynamic = scoped.policy.dynamic;
  return {
    id: scoped.id,
    scope: scoped.scope,
    mode: scoped.policy.hard.mode,
    value: row.value,
    dynamic:
      dynamic === null
        ? null
        : {
            mode: dynamic.floor.mode,
            value: dynamic.floor.mode === "percent" ? dynamic.floor.bp : dynamic.floor.millicents,
            unlock: dynamic.unlock,
          },
    drift: floorDrift(
      scoped.policy.hard,
      row.referenceCanonicalMillicents,
      currentCanonicalMillicents,
      row.updatedAt,
      now,
    ),
    createdBy: row.createdBy,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function magnitudeOf(alteration: PriceAlteration): number {
  return alteration.mode === "percent" ? alteration.bp : alteration.millicents;
}

function alterationOf(row: RuleRow): PriceAlteration {
  if (row.value === null || (row.direction !== "increase" && row.direction !== "decrease")) {
    throw new CorruptedPriceRuleError(row.id, "sens ou grandeur manquants sur une règle « alter »");
  }
  if (row.mode === "percent") {
    return { direction: row.direction, mode: "percent", bp: row.value };
  }
  if (row.mode === "amount") {
    return { direction: row.direction, mode: "amount", millicents: row.value };
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
