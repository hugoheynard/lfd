import {
  FEATURE_CATALOGUE,
  FEATURE_KEYS,
  exemptionKindOf,
  featureLevelsOf,
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
  StoredCompanyExemptionRow,
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
      ...stored.companyExemptions.flatMap(ignoredCompanyExemption),
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
    exemptBy: exemptionKindOf(key),
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
      .filter((exemption) => exemption.key === key && exemptionKindOf(key) === "email")
      .map((exemption) => ({
        id: exemption.id,
        email: exemption.email,
        createdAt: exemption.createdAt.toISOString(),
        createdBy: authorView(exemption.createdBy),
        accountState: exemption.accountState,
      })),
    companyExemptions: stored.companyExemptions
      .filter((exemption) => exemption.key === key && exemptionKindOf(key) === "company")
      .map((exemption) => ({
        companyId: exemption.companyId,
        companyName: exemption.companyName,
        createdAt: exemption.createdAt.toISOString(),
        createdBy: authorView(exemption.createdBy),
      })),
  };
}

/** L'auteur tel que l'écran le montre : un nom et un rôle, pas un identifiant. */
function authorView(trace: StaffTrace): FeatureAccessAuthorView {
  return { name: trace.name, role: trace.role };
}

function ignoredOverride(row: StoredOverrideRow): readonly IgnoredFeatureRowView[] {
  const base = { table: "override", key: row.key, id: null, detail: row.value } as const;
  if (!isFeatureKey(row.key)) {
    return [{ ...base, reason: "unknown_key" }];
  }
  if (!isFeatureLevel(row.key, row.value)) {
    return [{ ...base, reason: "unknown_level" }];
  }
  return [];
}

/**
 * Une exemption par adresse qui ne joue pas : sa clé a disparu, ou ne
 * s'exempte plus par adresse (`orderPlanner`, passée à la société).
 */
function ignoredExemption(row: StoredExemptionRow): readonly IgnoredFeatureRowView[] {
  const base = { table: "exemption", key: row.key, id: row.id, detail: row.email } as const;
  if (!isFeatureKey(row.key)) {
    return [{ ...base, reason: "unknown_key" }];
  }
  return exemptionKindOf(row.key) === "email"
    ? []
    : [{ ...base, reason: "exemption_kind_retired" }];
}

/** Une exemption par société qui ne joue pas, pour les mêmes raisons. */
function ignoredCompanyExemption(row: StoredCompanyExemptionRow): readonly IgnoredFeatureRowView[] {
  const base = {
    table: "company_exemption",
    key: row.key,
    id: row.companyId,
    detail: row.companyName,
  } as const;
  if (!isFeatureKey(row.key)) {
    return [{ ...base, reason: "unknown_key" }];
  }
  return exemptionKindOf(row.key) === "company"
    ? []
    : [{ ...base, reason: "exemption_kind_retired" }];
}
