import type { PlanVersion } from "../../entities/plan-version.js";
import type { VersionedCount } from "../../entities/plan-version.content.js";
import {
  PlanVersionNotFoundError,
  PlanVersionRangeInvertedError,
} from "../../errors/plan-version-diff-errors.js";
import type {
  PlanVersionDiff,
  PlanVersionMark,
  ProductionEffect,
} from "./plan-version-diff.types.js";
import { stepOf, type PlanVersionStep } from "./plan-version-step.js";

/** Les causes d'un arrêt : une première version sous une autre cause est d'avant les versions. */
const ARREST_CAUSES = new Set(["closed", "auto_closed", "opened_by_resupply"]);

/**
 * **Comparer deux versions du plan d'une journée**
 * (`documentation/fournil/les-versions-du-plan.md`) —
 * pure, elle ne reçoit que les versions.
 *
 * L'effet sur la production se lit sur le compte de `from` et de `to`, jamais
 * recalculé sur les lignes : une annulation après l'arrêt ne baisse pas le
 * compte, une révision ne le baisse jamais. Les changements, eux,
 * s'enchaînent de version en version : chacun est attribué à celle qui l'a
 * fait, et un aller-retour (entrée puis sortie) se voit.
 *
 * @param versions les versions de la journée, dans n'importe quel ordre ;
 *   toutes celles de `from` à `to` doivent y être.
 * @throws {PlanVersionRangeInvertedError} `from` est après `to`.
 * @throws {PlanVersionNotFoundError} une version de `from` à `to` manque.
 */
export function diffPlanVersions(
  versions: readonly PlanVersion[],
  from: number,
  to: number,
): PlanVersionDiff {
  if (from > to) {
    throw new PlanVersionRangeInvertedError(from, to);
  }
  const chain = chainOf(versions, from, to);
  const first = chain[0];
  const last = chain[chain.length - 1];
  if (first === undefined || last === undefined) {
    throw new PlanVersionNotFoundError(from);
  }
  const steps = chain.slice(1).map((version, index) => stepBetween(chain[index] ?? first, version));
  return {
    from: markOf(first),
    to: markOf(last),
    baselineUnknown: first.version === 1 && !ARREST_CAUSES.has(first.cause),
    production: productionEffects(first.content.counts, last.content.counts),
    changes: steps.flatMap((step) => step.changes),
    resupplies: steps.flatMap((step) => step.resupplies),
    toCheck: steps.flatMap((step) => step.toCheck),
  };
}

/** Les versions de `from` à `to`, dans l'ordre ; refuse un trou. */
function chainOf(
  versions: readonly PlanVersion[],
  from: number,
  to: number,
): readonly PlanVersion[] {
  const byNumber = new Map(versions.map((version) => [version.version, version]));
  const chain: PlanVersion[] = [];
  for (let number = from; number <= to; number += 1) {
    const version = byNumber.get(number);
    if (version === undefined) {
      throw new PlanVersionNotFoundError(number);
    }
    chain.push(version);
  }
  return chain;
}

function stepBetween(before: PlanVersion, after: PlanVersion): PlanVersionStep {
  return stepOf({
    before: before.content,
    beforeClosedAt: before.toRecord().closedAt,
    after: after.content,
    mark: markOf(after),
  });
}

function markOf(version: PlanVersion): PlanVersionMark {
  const record = version.toRecord();
  return {
    version: record.version,
    cause: record.cause,
    recordedAt: record.recordedAt,
    recordedBy: record.recordedBy,
    closedAt: record.closedAt,
  };
}

/** Par SKU, les seuls articles dont le compte change. */
function productionEffects(
  before: readonly VersionedCount[],
  after: readonly VersionedCount[],
): readonly ProductionEffect[] {
  const was = new Map(before.map((count) => [count.sku, count]));
  const is = new Map(after.map((count) => [count.sku, count]));
  const skus = [...new Set([...was.keys(), ...is.keys()])].sort((a, b) => a.localeCompare(b));
  return skus.flatMap((sku) => {
    const old = was.get(sku);
    const now = is.get(sku);
    const known = now ?? old;
    const quantityBefore = old?.quantity ?? 0;
    const quantityAfter = now?.quantity ?? 0;
    if (known === undefined || quantityBefore === quantityAfter) {
      return [];
    }
    return [
      {
        sku,
        productName: known.productName,
        saleUnit: known.saleUnit,
        before: quantityBefore,
        after: quantityAfter,
        delta: quantityAfter - quantityBefore,
      },
    ];
  });
}
