import type {
  CatalogRightGap,
  CatalogRightOverrideLine,
  CatalogRightRoleLine,
  CatalogRightTransferView,
  StaffAction,
  StaffOverrideEffect,
} from "@lfd/contracts";

import {
  CATALOG_RESOURCE,
  LEGACY_CATALOG_RESOURCE,
  type CatalogRightResource,
} from "./catalog-right-resources.js";
import type { CatalogRightOverride, CatalogRightRole } from "./catalog-right-transfer.reader.js";

/**
 * L'écart entre deux valeurs portées sur l'ancien et le nouveau droit — un
 * niveau pour un rôle, un effet pour une dérogation. Une seule règle pour les
 * deux, parce que la condition de L2 est la même : plus rien sur l'ancien, la
 * même chose sur le nouveau.
 */
function gapOf<T extends string>(
  legacy: T | null,
  current: T | null,
  missing: CatalogRightGap,
  mismatch: CatalogRightGap,
): CatalogRightGap {
  if (legacy === null) {
    return "none";
  }
  if (current === null) {
    return missing;
  }
  return legacy === current ? "legacy_still_held" : mismatch;
}

function roleLine(role: CatalogRightRole): CatalogRightRoleLine | null {
  const base = { key: role.key, label: role.label, archived: role.archived };
  if (role.grants === null) {
    return { ...base, legacyLevel: null, catalogLevel: null, gap: "unreadable_grants" };
  }
  const legacyLevel = role.grants[LEGACY_CATALOG_RESOURCE] ?? null;
  const catalogLevel = role.grants[CATALOG_RESOURCE] ?? null;
  if (legacyLevel === null && catalogLevel === null) {
    return null;
  }
  return {
    ...base,
    legacyLevel,
    catalogLevel,
    gap: gapOf(legacyLevel, catalogLevel, "catalog_missing", "level_mismatch"),
  };
}

/** Un retrait non recopié est un accès GAGNÉ à la bascule, pas perdu : il a son nom. */
function missingFor(legacyEffect: StaffOverrideEffect): CatalogRightGap {
  return legacyEffect === "deny" ? "revoke_not_copied" : "catalog_missing";
}

function overrideLines(
  overrides: readonly CatalogRightOverride[],
): readonly CatalogRightOverrideLine[] {
  // Une ligne par personne ET par action : la dérogation porte sur une
  // permission, et `read` et `write` se recopient séparément.
  const groups = new Map<string, CatalogRightOverride[]>();
  for (const entry of overrides) {
    const key = `${entry.staffUserId}\u0000${entry.action}`;
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [entry]);
    } else {
      group.push(entry);
    }
  }
  return [...groups.values()]
    .flatMap(([head, ...rest]) => (head === undefined ? [] : [overrideLine(head, rest)]))
    .sort(byNameThenAction);
}

function overrideLine(
  head: CatalogRightOverride,
  rest: readonly CatalogRightOverride[],
): CatalogRightOverrideLine {
  const entries = [head, ...rest];
  const effectOn = (resource: CatalogRightResource): StaffOverrideEffect | null =>
    entries.find((entry) => entry.resource === resource)?.effect ?? null;
  const legacyEffect = effectOn(LEGACY_CATALOG_RESOURCE);
  const catalogEffect = effectOn(CATALOG_RESOURCE);
  return {
    staffUserId: head.staffUserId,
    staffName: head.staffName,
    action: head.action,
    legacyEffect,
    catalogEffect,
    gap:
      legacyEffect === null
        ? "none"
        : gapOf(legacyEffect, catalogEffect, missingFor(legacyEffect), "effect_mismatch"),
  };
}

const ACTION_ORDER: Readonly<Record<StaffAction, number>> = { read: 0, write: 1 };

function byNameThenAction(a: CatalogRightOverrideLine, b: CatalogRightOverrideLine): number {
  return (
    a.staffName.localeCompare(b.staffName, "fr") ||
    a.staffUserId.localeCompare(b.staffUserId) ||
    ACTION_ORDER[a.action] - ACTION_ORDER[b.action]
  );
}

/**
 * **L'aperçu du transfert `b2b_catalog` → `lfc_catalog`**
 * (`plan-droit-lfc-catalog.md`, C2 et contradiction de `vitruve`).
 *
 * `clear` n'est vrai que si plus personne ne porte `b2b_catalog` et que tous
 * tiennent `lfc_catalog` au même niveau et au même effet : c'est-à-dire si
 * chaque ligne est `none`. Une liste vide est sans écart — aucune ligne, rien
 * à perdre. Les notifications n'y entrent pas (§5, Q3 : perdues assumées).
 */
export function assessCatalogRightTransfer(
  roles: readonly CatalogRightRole[],
  overrides: readonly CatalogRightOverride[],
  unreadLegacyNotifications: number,
): CatalogRightTransferView {
  const roleLines = roles
    .map(roleLine)
    .filter((line): line is CatalogRightRoleLine => line !== null)
    .sort((a, b) => a.key.localeCompare(b.key));
  const lines = overrideLines(overrides);
  const clear = [...roleLines, ...lines].every((line) => line.gap === "none");
  return { roles: roleLines, overrides: [...lines], unreadLegacyNotifications, clear };
}
