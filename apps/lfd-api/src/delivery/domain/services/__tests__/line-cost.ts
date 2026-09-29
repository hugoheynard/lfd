import { UnknownCostPointError } from "../../errors/delivery-routing-errors.js";
import type { CostFn } from "../../ports/distance-matrix.js";

/**
 * Une matrice de test sur une LIGNE : chaque point est une abscisse, une unité
 * vaut une minute de route et un kilomètre. `extraBack` alourdit le trajet
 * vers les abscisses plus petites — une matrice asymétrique, comme un sens
 * interdit.
 */
export function lineCost(positions: Readonly<Record<string, number>>, extraBack = 0): CostFn {
  const at = (id: string): number => {
    const position = positions[id];
    if (position === undefined) {
      throw new UnknownCostPointError(id);
    }
    return position;
  };
  const units = (from: string, to: string): number => {
    const delta = at(to) - at(from);
    return Math.abs(delta) + (delta < 0 ? extraBack : 0);
  };
  return {
    meters: (from, to) => units(from, to) * 1000,
    seconds: (from, to) => units(from, to) * 60,
  };
}

/** Une matrice de test sur un PLAN : des coordonnées, une unité = une minute. */
export function planeCost(positions: Readonly<Record<string, readonly [number, number]>>): CostFn {
  const at = (id: string): readonly [number, number] => {
    const position = positions[id];
    if (position === undefined) {
      throw new UnknownCostPointError(id);
    }
    return position;
  };
  const units = (from: string, to: string): number => {
    const [x1, y1] = at(from);
    const [x2, y2] = at(to);
    return Math.hypot(x2 - x1, y2 - y1);
  };
  return {
    meters: (from, to) => units(from, to) * 1000,
    seconds: (from, to) => units(from, to) * 60,
  };
}
