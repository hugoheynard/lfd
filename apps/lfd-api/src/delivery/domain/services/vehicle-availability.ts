import { compareIds } from "./compare-ids.js";
import type { PlanningContext, PlanningVehicle } from "./proposal.js";
import type { RoutingStop } from "./route-timing.js";
import { timeComposition } from "./time-composition.js";
import { openingOf, type VehicleStart } from "./vehicle-plan.js";

/** Une tournée gardée qui OCCUPE son véhicule : chargée ou partie (L7t-C2). */
export interface BusyRound {
  readonly roundId: string;
  readonly vehicle: PlanningVehicle;
  readonly passage: number;
  /** Ses arrêts, tous situés, dans l'ordre de passage. */
  readonly stops: readonly RoutingStop[];
  /** Partie à cette heure (secondes depuis minuit, heure de Paris), ou `null`. */
  readonly departedAt: number | null;
}

/**
 * **Quand chaque camionnette occupée est libre** (lot 7 ter, L7t-C2 — Hugo,
 * 2026-09-29 : « pourquoi dans la démo j'ai deux fois camionnette 1 ? »). Ses
 * tournées chargées ou parties sont chronométrées telles quelles
 * (`timeComposition`, dans l'ordre de leurs passages) ; elle n'est libre qu'au
 * retour estimé de la dernière, et sa prochaine tournée y est un passage de
 * plus.
 *
 * Une tournée PARTIE plus tard que l'heure chronométrée revient plus tard :
 * son retour est repoussé d'autant — jamais avancé, l'estimation reste
 * prudente.
 *
 * Pure et déterministe.
 */
export function busyStarts(
  ctx: PlanningContext,
  rounds: readonly BusyRound[],
): ReadonlyMap<string, VehicleStart> {
  const ordered = [...rounds].sort(
    (a, b) => compareIds(a.vehicle.id, b.vehicle.id) || a.passage - b.passage,
  );
  const timed = timeComposition({
    depotId: ctx.depotId,
    rounds: ordered.map(({ roundId, vehicle, stops }) => ({ roundId, vehicle, stops })),
    cost: ctx.cost,
    settings: ctx.settings,
  });
  const starts = new Map<string, VehicleStart>();
  timed.forEach((tour, index) => {
    const actual = ordered[index]?.departedAt ?? null;
    const late = actual === null ? 0 : Math.max(0, actual - tour.timed.departure);
    const previous = starts.get(tour.vehicleId);
    starts.set(tour.vehicleId, {
      availableFrom: Math.max(
        openingOf(ctx),
        previous?.availableFrom ?? 0,
        tour.timed.return + late,
      ),
      passagesBefore: (previous?.passagesBefore ?? 0) + 1,
    });
  });
  return starts;
}
