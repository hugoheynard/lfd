import type { DeliveryRoundProposalView } from '@lfd/contracts';

import type { PlannedRound, PlannedStop } from './delivery-planning';
import type { ComposedDay, ComposedRound } from './delivery-rounds';
import { defaultDemandLabel } from './delivery-routing';
import { orderOfStop } from './rounds-board-lists';
import {
  type Board,
  type BoardOrder,
  type BoardReason,
  type BoardRound,
  type BoardStop,
  boardOfComposed,
  withClashes,
} from './rounds-board-model';

/**
 * L'aperçu d'une proposition de « Proposer », au format du tableau — pour
 * qu'un seul écran serve la composition enregistrée et la proposition. Sorti
 * de `rounds-board-model.ts` : ce qui ne vaut que pour l'aperçu vit ici.
 */

/**
 * L'aperçu d'une proposition, au format du tableau. Un arrêt est « proposé »
 * quand le calcul l'a mis là où il n'était pas : une tournée à ouvrir, ou une
 * tournée existante qui ne le portait pas.
 */
export function boardOfPlan(
  plan: readonly PlannedRound[],
  pool: readonly string[],
  composed: ComposedDay | null,
  proposal: DeliveryRoundProposalView,
): Board {
  const live = composed === null ? new Map<string, ComposedRound>() : roundsById(composed);
  const known = composed === null ? emptyBoard() : boardOfComposed(composed);
  const knownStops = new Map(
    known.rounds.flatMap((round) => round.stops.map((stop) => [stop.orderId, stop] as const)),
  );
  const unknownDemand = new Set(proposal.unknownDemand.map((order) => order.orderId));
  const defaulted = new Map(
    proposal.defaultDemand.map((demand) => [demand.orderId, defaultDemandLabel(demand)] as const),
  );
  const rounds = plan.map((planned): BoardRound => {
    const current = planned.roundId === null ? undefined : live.get(planned.roundId);
    const before = new Set(current?.stops.map(({ stop }) => stop.orderId) ?? []);
    const stops = planned.stops.map((stop) =>
      plannedStopOnBoard(
        stop,
        knownStops.get(stop.orderId),
        !before.has(stop.orderId),
        defaulted.get(stop.orderId) ?? null,
      ),
    );
    return {
      key: planned.key,
      roundId: planned.roundId,
      vehicleId: planned.vehicleId,
      vehicleName: planned.vehicleName,
      passage: planned.passage,
      departedAt: current?.round.departedAt ?? null,
      returnedAt: current?.round.returnedAt ?? null,
      frozen: planned.lock !== null,
      vehicleRetired: current?.round.vehicleRetired ?? false,
      driver: current?.round.driver ?? null,
      geometry: planned.geometry,
      timing: planned.timing,
      unknownDemand: stops.filter((stop) => unknownDemand.has(stop.orderId)).length,
      place: null,
      stops: withClashes(stops),
    };
  });
  return { rounds, pool: poolOfPreview(pool, known, proposal) };
}

function plannedStopOnBoard(
  stop: PlannedStop,
  known: BoardStop | undefined,
  proposed: boolean,
  defaultDemand: string | null,
): BoardStop {
  return {
    orderId: stop.orderId,
    stopId: known?.stopId ?? null,
    reference: stop.reference,
    sheet: stop.sheet,
    window: stop.window,
    windowClash: null,
    signals: known?.signals ?? [],
    broughtBackAt: known?.broughtBackAt ?? null,
    proposed,
    windowMissed: stop.windowMissed,
    // L'aperçu dit son propre retard (`windowMissed`) ; le rouge est celui du geste enregistré.
    placementLate: false,
    defaultDemand,
    // Comme le rouge : l'étiquette est celle de la composition enregistrée.
    outOfZone: false,
  };
}

function poolOfPreview(
  pool: readonly string[],
  known: Board,
  proposal: DeliveryRoundProposalView,
): readonly BoardOrder[] {
  const reasons = reasonsOf(proposal);
  const orders = new Map<string, BoardOrder>([
    ...known.pool.map((order) => [order.orderId, order] as const),
    ...known.rounds.flatMap((round) =>
      round.stops.map((stop) => [stop.orderId, orderOfStop(stop)] as const),
    ),
  ]);
  for (const ref of [...proposal.unlocated, ...proposal.overflow, ...proposal.unfit]) {
    if (!orders.has(ref.orderId)) {
      orders.set(ref.orderId, {
        orderId: ref.orderId,
        reference: ref.reference,
        sheet: null,
        broughtBackAt: null,
        reason: null,
      });
    }
  }
  return pool.flatMap((id) => {
    const order = orders.get(id);
    if (order === undefined) {
      return [];
    }
    return [{ ...order, reason: reasons.get(id) ?? null }];
  });
}

/** La raison de chaque commande que le calcul a laissée à répartir ; la première l'emporte. */
function reasonsOf(proposal: DeliveryRoundProposalView): ReadonlyMap<string, BoardReason> {
  const reasons = new Map<string, BoardReason>();
  const add = (orderId: string, reason: BoardReason): void => {
    if (!reasons.has(orderId)) {
      reasons.set(orderId, reason);
    }
  };
  proposal.unlocated.forEach((order) => add(order.orderId, 'unlocated'));
  proposal.overflow.forEach((order) => add(order.orderId, 'overflow'));
  proposal.unfit.forEach((order) => add(order.orderId, order.reason));
  return reasons;
}

function roundsById(composed: ComposedDay): Map<string, ComposedRound> {
  return new Map(composed.rounds.map((round) => [round.round.id, round]));
}

function emptyBoard(): Board {
  return { rounds: [], pool: [] };
}

/**
 * « À répartir » dans l'aperçu : ce que le calcul n'a placé nulle part — les
 * commandes connues de la composition, et celles qu'il nomme non situées ou
 * hors durée, moins celles qu'une colonne porte.
 */
export function previewPoolOf(
  plan: readonly PlannedRound[],
  composed: ComposedDay | null,
  proposal: DeliveryRoundProposalView,
): readonly string[] {
  const placed = new Set(plan.flatMap((round) => round.stops.map((stop) => stop.orderId)));
  const candidates = [
    ...(composed?.unassigned.map(({ order }) => order.orderId) ?? []),
    ...(composed?.rounds.flatMap((round) => round.stops.map(({ stop }) => stop.orderId)) ?? []),
    ...proposal.unlocated.map((order) => order.orderId),
    ...proposal.overflow.map((order) => order.orderId),
    ...proposal.unfit.map((order) => order.orderId),
  ];
  return [...new Set(candidates)].filter((id) => !placed.has(id));
}
