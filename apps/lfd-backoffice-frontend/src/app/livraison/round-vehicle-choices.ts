import type { VehicleView } from '@lfd/contracts';

import { type ComposedRound, stopCountLabel } from './delivery-rounds';
import type { PlannerVehicle } from './planner-popover/planner-popover';
import { alertCountOf, type Board } from './rounds-board-model';
import { vehicleBadgeLabel } from './vehicle-load';

/**
 * Ce que l'en-tête de l'organisateur propose et compte : les véhicules de
 * « + Nouvelle tournée » et de « Proposer », leur charge, le décompte du
 * tableau. Sorti de `RoundsPage` en fonctions pures — la page ne garde que
 * ce qui lit ses signaux.
 */

/** Une ligne de « + Nouvelle tournée ». */
export interface NewRoundChoice {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly sub: string;
}

/** « + Nouvelle tournée » : un véhicule déjà engagé ouvre son passage suivant (Q13). */
export function newRoundChoicesOf(
  vehicles: readonly VehicleView[],
  rounds: readonly ComposedRound[],
  colors: ReadonlyMap<string, string>,
  loadBadges: ReadonlyMap<string, string>,
): readonly NewRoundChoice[] {
  return vehicles.map((vehicle) => {
    const count = rounds.filter(({ round }) => round.vehicleId === vehicle.id).length;
    return {
      id: vehicle.id,
      name: vehicle.name,
      color: colors.get(vehicle.id) ?? '',
      sub: count > 0 ? `passage ${String(count + 1)}` : (loadBadges.get(vehicle.id) ?? ''),
    };
  });
}

/** Les véhicules qu'on coche dans « Proposer » ; un véhicule tout parti en est exclu. */
export function plannerVehiclesOf(
  vehicles: readonly VehicleView[],
  rounds: readonly ComposedRound[],
  colors: ReadonlyMap<string, string>,
): readonly PlannerVehicle[] {
  return vehicles.map((vehicle) => {
    const own = rounds.filter(({ round }) => round.vehicleId === vehicle.id);
    const open = own.filter(({ round }) => round.departedAt === null);
    const excluded = own.length > 0 && open.length === 0;
    const stops = open.reduce((total, { stops: placed }) => total + placed.length, 0);
    return {
      id: vehicle.id,
      name: vehicle.name,
      color: colors.get(vehicle.id) ?? '',
      sub: excluded ? 'partie · exclue' : stopCountLabel(stops),
      excluded,
    };
  });
}

/** Le chargement de chaque véhicule connu — lecture seule (L2b-C3, L2b-C4). */
export function loadBadgesOf(fleet: readonly VehicleView[]): ReadonlyMap<string, string> {
  return new Map(
    fleet.flatMap((vehicle) => {
      const label = vehicleBadgeLabel(vehicle);
      return label === null ? [] : [[vehicle.id, label] as const];
    }),
  );
}

/** Le décompte de l'en-tête : « À répartir », tournées et arrêts, ce qui est à régler. */
export interface BoardSummary {
  readonly pool: number;
  readonly rounds: string;
  readonly alerts: number;
}

export function boardSummaryOf(board: Board | null): BoardSummary {
  const rounds = board?.rounds ?? [];
  const stops = rounds.reduce((total, round) => total + round.stops.length, 0);
  return {
    pool: board?.pool.length ?? 0,
    rounds: `${rounds.length === 1 ? '1 tournée' : `${String(rounds.length)} tournées`} · ${
      stops === 1 ? '1 arrêt' : `${String(stops)} arrêts`
    }`,
    alerts: rounds.reduce((total, round) => total + alertCountOf(round), 0),
  };
}
