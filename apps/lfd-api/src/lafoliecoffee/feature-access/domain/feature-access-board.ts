import {
  FEATURE_CATALOGUE,
  FEATURE_KEYS,
  featureLevelsOf,
  isExemptible,
  isFeatureKey,
  isFeatureLevel,
  type AdminFeatureAccessView,
  type AdminFeatureView,
  type FeatureAccessAuthorView,
  type FeatureKey,
  type IgnoredFeatureRowView,
} from "@lfd/contracts";

import type { StaffTrace } from "../../account/domain/value-objects/staff-trace.js";

import type {
  StoredExemptionRow,
  StoredFeatureAccess,
  StoredOverrideRow,
} from "./ports/feature-access-board.reader.js";
import { resolveFeatureLevel } from "./feature-level-resolution.js";

/**
 * **L'écran admin, composé** à partir de ce qui est en base.
 *
 * Pure : le catalogue décide de ce qui se lit, les lignes qu'il ne sait pas lire
 * partent dans `ignored`. Une ligne ignorée n'est jamais « presque » appliquée :
 * elle est montrée pour qu'on la retire, pas interprétée.
 */
export function composeFeatureAccessBoard(stored: StoredFeatureAccess): AdminFeatureAccessView {
  return {
    features: FEATURE_KEYS.map((key) => featureView(key, stored)),
    ignored: [
      ...stored.overrides.flatMap(ignoredOverride),
      ...stored.exemptions.flatMap(ignoredExemption),
    ],
  };
}

function featureView(key: FeatureKey, stored: StoredFeatureAccess): AdminFeatureView {
  const definition = FEATURE_CATALOGUE[key];
  const row = stored.overrides.find((candidate) => candidate.key === key);
  const override = row !== undefined && isFeatureLevel(key, row.value) ? row : null;
  return {
    key,
    label: definition.label,
    description: definition.description,
    levels: featureLevelsOf(key),
    defaultLevel: definition.defaultLevel,
    exemptible: isExemptible(key),
    effectiveLevel: resolveFeatureLevel(key, {
      exempt: false,
      storedOverride: override?.value ?? null,
    }),
    override:
      override === null
        ? null
        : {
            value: override.value,
            updatedAt: override.updatedAt.toISOString(),
            updatedBy: authorView(override.updatedBy),
          },
    exemptions: stored.exemptions
      .filter((exemption) => exemption.key === key)
      .map((exemption) => ({
        id: exemption.id,
        email: exemption.email,
        createdAt: exemption.createdAt.toISOString(),
        createdBy: authorView(exemption.createdBy),
        accountState: exemption.accountState,
      })),
  };
}

/** L'auteur tel que l'écran le montre : un nom et un rôle, pas un identifiant. */
function authorView(trace: StaffTrace): FeatureAccessAuthorView {
  return { name: trace.name, role: trace.role };
}

function ignoredOverride(row: StoredOverrideRow): readonly IgnoredFeatureRowView[] {
  if (!isFeatureKey(row.key)) {
    return [{ table: "override", key: row.key, detail: row.value, reason: "unknown_key" }];
  }
  if (!isFeatureLevel(row.key, row.value)) {
    return [{ table: "override", key: row.key, detail: row.value, reason: "unknown_level" }];
  }
  return [];
}

function ignoredExemption(row: StoredExemptionRow): readonly IgnoredFeatureRowView[] {
  return isFeatureKey(row.key)
    ? []
    : [{ table: "exemption", key: row.key, detail: row.email, reason: "unknown_key" }];
}
