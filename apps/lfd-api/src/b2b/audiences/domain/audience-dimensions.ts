import type { AudienceDimension } from "@lfd/contracts";

import { ACTIVITY_FAMILIES, activityFamilyOf } from "./activity-families.js";
import { LOYALTY_TIERS } from "./loyalty-tiers.js";
import { allMomentCells, momentCell } from "./order-moments.js";

/** Une case d'une coupe : sa clé stable et son libellé. */
export interface DimensionCell {
  readonly key: string;
  readonly label: string;
}

/**
 * **Ce qu'une coupe sait de ses cases.**
 *
 * - `canonical` : les cases montrées même vides, dans l'ordre de l'écran ;
 *   vide pour une coupe ouverte (sites, zones), dont les cases sont celles
 *   que la base rend, rangées par libellé.
 * - `cellOf` : la case d'une clé brute de la base.
 *
 * 🔴 Deux clés brutes qui tombent dans la même case s'ADDITIONNENT, clients
 * distincts compris. Ce n'est juste que si chaque client ne tombe que dans
 * une seule clé brute : vrai pour l'activité (un client pro = une société =
 * un code NAF), et trivial pour les autres coupes, où la case EST la clé.
 */
export interface AudienceDimensionRule {
  readonly canonical: readonly DimensionCell[];
  cellOf(rawKey: string, rawLabel: string | null): DimensionCell;
}

const UNKNOWN_CELL: DimensionCell = { key: "unknown", label: "Non renseigné" };

/** Une coupe fermée dont la clé brute est déjà la clé de la case. */
function closedRule(cells: readonly DimensionCell[]): AudienceDimensionRule {
  return {
    canonical: cells,
    cellOf: (rawKey) => cells.find((cell) => cell.key === rawKey) ?? UNKNOWN_CELL,
  };
}

/** Une coupe fermée dont la base rend un INDEX (tranche, palier). */
function indexedRule(cells: readonly DimensionCell[]): AudienceDimensionRule {
  return {
    canonical: cells,
    cellOf: (rawKey) => cells[Number(rawKey)] ?? UNKNOWN_CELL,
  };
}

/**
 * Les règles des sept coupes. Une table et non un `switch` : une coupe de
 * plus est une entrée de plus (et son expression dans l'adaptateur).
 */
export const AUDIENCE_DIMENSION_RULES: Readonly<Record<AudienceDimension, AudienceDimensionRule>> =
  {
    clientele: closedRule([
      { key: "pro", label: "Professionnels" },
      { key: "public", label: "Particuliers" },
    ]),
    activity: {
      canonical: ACTIVITY_FAMILIES,
      cellOf: (rawKey) => {
        const family = activityFamilyOf(rawKey);
        return ACTIVITY_FAMILIES.find((entry) => entry.key === family) ?? UNKNOWN_CELL;
      },
    },
    fulfillment: closedRule([
      { key: "pickup", label: "Retrait" },
      { key: "delivery", label: "Livraison" },
    ]),
    pickup_site: {
      canonical: [],
      cellOf: (rawKey, rawLabel) =>
        rawKey === ""
          ? { key: "unknown", label: "Point de retrait non renseigné" }
          : { key: rawKey, label: rawLabel ?? rawKey },
    },
    delivery_zone: {
      canonical: [],
      cellOf: (rawKey, rawLabel) =>
        rawKey === ""
          ? { key: "unknown", label: "Adresse de livraison non figée" }
          : { key: rawKey, label: rawLabel === null ? rawKey : `${rawKey} ${rawLabel}` },
    },
    loyalty: indexedRule(LOYALTY_TIERS),
    moment: {
      canonical: allMomentCells(),
      cellOf: (rawKey) => {
        const [day, slice] = rawKey.split("-").map(Number);
        return momentCell(day ?? 0, slice ?? -1) ?? UNKNOWN_CELL;
      },
    },
  };
