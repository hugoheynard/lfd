import type { CostFn } from "../ports/distance-matrix.js";
import { compareIds } from "./compare-ids.js";
import {
  durationOf,
  type RouteClock,
  type RoutingStop,
  type TimedRoute,
  timeChain,
} from "./route-timing.js";

/** L'horaire qu'une tournée a déjà reçu, en secondes depuis minuit du jour. */
export interface PlannedSpan {
  readonly departure: number;
  readonly return: number;
}

/**
 * Une tournée du jour, vue par le placement d'un transfert : ses arrêts
 * vivants dans l'ordre de passage, son véhicule, son passage, son horaire.
 */
export interface TransferCandidateRound {
  readonly roundId: string;
  readonly vehicleId: string;
  readonly passage: number;
  readonly stops: readonly RoutingStop[];
  /**
   * Peut-elle recevoir le transfert ? `false` : elle ne fait que tenir le
   * véhicule (partie, ou vide) — elle compte dans l'horloge de ses autres
   * passages, sans être une place.
   */
  readonly open: boolean;
  /**
   * Son horaire prévu, quand elle en a un : il TIENT pour les autres passages
   * du véhicule — le transfert placé ailleurs ne le déplace pas. `null` :
   * chronométrée à la suite du passage précédent.
   */
  readonly planned: PlannedSpan | null;
}

/** La place retenue : la tournée, et le nombre d'arrêts vivants avant le transfert. */
export interface TransferInsertion {
  readonly roundId: string;
  readonly after: number;
  /** Le temps de tournée ajouté au véhicule, en secondes. */
  readonly addedSeconds: number;
}

type PlacementInput = Parameters<typeof cheapestTransferInsertion>[0];

/** Le morceau du véhicule qu'une insertion peut bouger, chronométré sans elle. */
interface Segment {
  readonly floor: number;
  readonly routes: readonly (readonly RoutingStop[])[];
  /** Le départ prévu du passage suivant qui garde son horaire ; `Infinity` : aucun. */
  readonly returnBy: number;
  readonly base: Measure;
}

interface Measure {
  readonly lateSeconds: number;
  readonly seconds: number;
  readonly overrunSeconds: number;
}

/**
 * **Où insérer l'arrêt d'un transfert interne** (plan du transfert interne,
 * §5, mode intégré, lot T1) — au moindre temps de tournée ajouté, dans une
 * tournée au dépôt, SOUS la fenêtre « arrivé avant » du site.
 *
 * Une place n'est retenue que si le transfert y arrive à temps ET qu'elle
 * n'ajoute aucun retard aux arrêts déjà là — ni à ceux des passages suivants
 * du même véhicule, ni à l'heure prévue du prochain passage qui en a une :
 * servir le village ne se paie jamais du retard d'un client livré. `null` :
 * aucune tournée ne le peut — la composition ouvre alors une tournée dédiée
 * (repli automatique, Q-T9), ou le journal dit le transfert non placé.
 *
 * 🔴 **Une tournée part au retour de son passage précédent**, à son heure
 * prévue s'il en a une — jamais « dès l'heure réglée » quand elle est seconde.
 * Régression du 2026-10-14 (la démo) : chaque tournée était chronométrée
 * SEULE, et la tournée d'après-midi de Camionnette 1 recevait le transfert du
 * Village, dû avant l'ouverture du comptoir — en silence, des heures trop tard.
 *
 * ⚠️ **Revenue par la donnée le 2026-10-24** : cette fonction était juste, mais
 * la fenêtre qu'elle reçoit (`arrivalBy`) arrivait `null` après l'arrêt du
 * plan — le commerce la calculait sur les commandes `placed`, toutes
 * confirmées à ce moment-là. Sans fenêtre, n'importe quelle place convient.
 * Corrigé côté commerce (`CommerceTransferSites` lit les retraits vivants).
 *
 * Pure et déterministe : à temps ajouté égal, la tournée d'identifiant le
 * plus petit, puis la place la plus tôt.
 */
export function cheapestTransferInsertion(input: {
  readonly depotId: string;
  readonly cost: CostFn;
  readonly clock: RouteClock;
  readonly transfer: RoutingStop;
  readonly rounds: readonly TransferCandidateRound[];
}): TransferInsertion | null {
  let best: TransferInsertion | null = null;
  for (const chain of vehicleChains(input.rounds)) {
    for (const [index, round] of chain.entries()) {
      if (!round.open) {
        continue;
      }
      const segment = segmentOf(input, chain, index);
      for (let after = 0; after <= round.stops.length; after += 1) {
        const added = addedSecondsAt(input, segment, after);
        if (added !== null && better(round.roundId, added, best)) {
          best = { roundId: round.roundId, after, addedSeconds: added };
        }
      }
    }
  }
  return best;
}

/** Le temps ajouté par le transfert à cette place ; `null` : en retard, ou il retarde. */
function addedSecondsAt(input: PlacementInput, segment: Segment, after: number): number | null {
  const [first = [], ...rest] = segment.routes;
  const inserted = [...first.slice(0, after), input.transfer, ...first.slice(after)];
  const timed = timeFrom(input, segment.floor, [inserted, ...rest]);
  const measure = measureOf(timed, segment.returnBy);
  if (
    timed[0]?.missed[after] !== false ||
    measure.lateSeconds > segment.base.lateSeconds ||
    measure.overrunSeconds > segment.base.overrunSeconds
  ) {
    return null;
  }
  return measure.seconds - segment.base.seconds;
}

/**
 * Ce que l'insertion dans le passage `index` peut bouger : lui, et les
 * passages suivants jusqu'au premier qui a son heure prévue. Il part au plus
 * tôt au retour du passage précédent.
 */
function segmentOf(
  input: PlacementInput,
  chain: readonly TransferCandidateRound[],
  index: number,
): Segment {
  const floor = floorOf(input, chain, index);
  const next = chain.findIndex((round, position) => position > index && round.planned !== null);
  const end = next === -1 ? chain.length : next;
  const routes = chain.slice(index, end).map((round) => round.stops);
  const returnBy = chain[next]?.planned?.departure ?? Infinity;
  return { floor, routes, returnBy, base: measureOf(timeFrom(input, floor, routes), returnBy) };
}

/** Le plus tôt où le passage `index` peut partir : le retour de celui qui le précède. */
function floorOf(
  input: PlacementInput,
  chain: readonly TransferCandidateRound[],
  index: number,
): number {
  let start = input.clock.earliestDeparture;
  let from = 0;
  for (let position = index - 1; position >= 0; position -= 1) {
    const planned = chain[position]?.planned ?? null;
    if (planned !== null) {
      start = Math.max(start, planned.return);
      from = position + 1;
      break;
    }
  }
  const before = chain.slice(from, index).map((round) => round.stops);
  return timeFrom(input, start, before).at(-1)?.return ?? start;
}

function timeFrom(
  input: PlacementInput,
  floor: number,
  routes: readonly (readonly RoutingStop[])[],
): readonly TimedRoute[] {
  return timeChain(input.depotId, routes, input.cost, { ...input.clock, earliestDeparture: floor });
}

function measureOf(timed: readonly TimedRoute[], returnBy: number): Measure {
  const back = timed.at(-1)?.return ?? 0;
  return {
    lateSeconds: timed.reduce((total, route) => total + route.lateSeconds, 0),
    seconds: timed.reduce((total, route) => total + durationOf(route), 0),
    overrunSeconds: Math.max(0, back - returnBy),
  };
}

/** Moins de temps ajouté ; à égalité, la tournée d'identifiant le plus petit. */
function better(roundId: string, added: number, best: TransferInsertion | null): boolean {
  if (best === null || added < best.addedSeconds) {
    return true;
  }
  return added === best.addedSeconds && compareIds(roundId, best.roundId) < 0;
}

/** Les passages de chaque véhicule, dans l'ordre des passages. */
function vehicleChains(
  rounds: readonly TransferCandidateRound[],
): readonly (readonly TransferCandidateRound[])[] {
  const byVehicle = new Map<string, TransferCandidateRound[]>();
  for (const round of rounds) {
    byVehicle.set(round.vehicleId, [...(byVehicle.get(round.vehicleId) ?? []), round]);
  }
  return [...byVehicle.values()].map((chain) =>
    [...chain].sort((left, right) => left.passage - right.passage),
  );
}
