import { type CapacityGrid, HALF_BIN, loadIn } from "./pack-group.js";
import type { PackedBins } from "./propose-packing.js";

/** Tolérance des sommes de fractions — celle du colisage. */
const EPSILON = 1e-9;

/** Une moitié libre d'un arrêt consécutif, telle que le choix la lit. */
export interface FreeHalf {
  readonly binId: string;
  readonly orderId: string;
  readonly position: number;
  readonly binTypeId: string;
  readonly isotherm: boolean;
}

/** Le partage retenu : quelle moitié, pour le dernier bac de quelle entrée. */
export interface ShareChoice {
  readonly half: FreeHalf;
  readonly replacesBinIndex: number;
}

/**
 * **Le demi-bac partagé, en dernier recours** (lot 4 bis, v2-4, Q2) — pure.
 *
 * `halves` ne porte que des moitiés libres d'arrêts CONSÉCUTIFS d'une tournée
 * non partie, de types en service : c'est l'appelant qui les lit. Ici, la
 * seule question est de PLACE et de FROID : le dernier bac d'une entrée
 * tient-il dans 0,5 du type de la moitié, et la moitié est-elle du même genre
 * (isotherme pour isotherme, sec pour sec) que ce bac ? La cloison sépare
 * deux clients, pas le froid du sec.
 *
 * Première entrée, puis première moitié (par position d'arrêt, puis
 * identifiant) : la même lecture rend le même choix. `null` sinon.
 */
export function pickShareCandidate(
  bins: readonly PackedBins[],
  isothermOf: (binTypeId: string) => boolean,
  halves: readonly FreeHalf[],
  grid: CapacityGrid,
): ShareChoice | null {
  const ordered = [...halves].sort(
    (a, b) => a.position - b.position || (a.binId < b.binId ? -1 : a.binId > b.binId ? 1 : 0),
  );
  for (const [index, entry] of bins.entries()) {
    if (entry.lastContent.length === 0) {
      continue;
    }
    const isotherm = isothermOf(entry.binTypeId);
    const half = ordered.find((candidate) => {
      if (candidate.isotherm !== isotherm) {
        return false;
      }
      const load = loadIn(entry.lastContent, candidate.binTypeId, grid);
      return load !== null && load <= HALF_BIN + EPSILON;
    });
    if (half !== undefined) {
      return { half, replacesBinIndex: index };
    }
  }
  return null;
}
