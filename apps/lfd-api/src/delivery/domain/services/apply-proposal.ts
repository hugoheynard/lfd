import type { DeliveryRound, DetachedStop } from "../entities/delivery-round.js";
import { InvalidProposalError } from "../errors/delivery-routing-errors.js";
import type { MovedStop } from "../ports/delivery-proposal.repository.js";

/** Une tournée de la proposition, telle que l'écran la renvoie. */
export interface ProposedComposition {
  /** Une tournée existante, ou `null` : à ouvrir. */
  readonly roundId: string | null;
  readonly vehicleId: string;
  /** La liste COMPLÈTE de ses commandes, dans l'ordre de passage. */
  readonly orderIds: readonly string[];
}

export interface ApplyProposalInput {
  readonly proposal: readonly ProposedComposition[];
  /** Les tournées existantes touchées, chargées, versions vérifiées. */
  readonly rounds: ReadonlyMap<string, DeliveryRound>;
  /** Ouvre une tournée neuve pour ce véhicule (passage tiré par l'appelant). */
  readonly open: (vehicleId: string) => DeliveryRound;
  readonly newStopId: () => string;
  readonly at: Date;
}

/** Une tournée écrite par l'application, avec ses commandes d'avant. */
export interface AppliedRound {
  readonly round: DeliveryRound;
  readonly before: readonly string[];
  readonly opened: boolean;
}

export interface AppliedProposal {
  readonly rounds: readonly AppliedRound[];
  /** Les arrêts existants qui changent de tournée — dont le chargement se vérifie sous verrou. */
  readonly movedStops: readonly MovedStop[];
}

interface Target {
  readonly round: DeliveryRound;
  readonly item: ProposedComposition;
  readonly opened: boolean;
}

/**
 * **Applique une proposition** (L7-C6, L7-C11) sur les tournées, par leurs
 * méthodes métier — les invariants restent ceux de la tournée : un arrêt
 * déplacé est la MÊME ligne (C11), une tournée partie refuse tout (I6), l'ordre
 * final est une permutation exacte (I2).
 *
 * Trois temps, pour qu'une tournée à la fois source et destination ne se
 * contredise pas : détacher tout ce qui change de tournée, rattacher et
 * affecter, puis réordonner chaque tournée dans l'ordre proposé.
 *
 * 🔴 Une tournée de la proposition dont un arrêt vivant n'est placé NULLE PART
 * est refusée : appliquer ne retire jamais un arrêt en silence — retirer est
 * un geste à la main (Q11).
 *
 * @throws {InvalidProposalError} une commande ou une tournée deux fois, un
 *   véhicule qui n'est pas celui de la tournée, un arrêt oublié.
 * @throws {DeliveryRoundDepartedError} une tournée touchée est partie.
 */
export function applyProposal(input: ApplyProposalInput): AppliedProposal {
  ensureOnce(input.proposal);
  const before = new Map([...input.rounds].map(([id, round]) => [id, round.orderIds]));
  const holders = holdersOf(input.rounds);
  const targets = input.proposal.map((item) => targetOf(item, input));
  const moved = new Map<string, DetachedStop>();
  const movedStops: MovedStop[] = [];
  for (const { round, item } of targets) {
    for (const orderId of item.orderIds) {
      const holder = holders.get(orderId);
      if (holder !== undefined && holder.round !== round) {
        moved.set(orderId, holder.round.detach(holder.stopId, input.at));
        movedStops.push({ stopId: holder.stopId, fromVehicleName: holder.round.vehicleName });
      }
    }
  }
  for (const { round, item } of targets) {
    const forgotten = round.orderIds.find((orderId) => !item.orderIds.includes(orderId));
    if (forgotten !== undefined) {
      throw new InvalidProposalError(
        `la commande ${forgotten} de la tournée « ${round.vehicleName} » n'est placée nulle part`,
      );
    }
    for (const orderId of item.orderIds) {
      const stop = moved.get(orderId);
      if (stop !== undefined) {
        round.attach(stop, input.at);
      } else if (!holders.has(orderId)) {
        round.assign(input.newStopId(), orderId, input.at);
      }
    }
    const stopIds = new Map(round.liveStops.map((stop) => [stop.orderId, stop.id]));
    round.reorder(
      item.orderIds.flatMap((orderId) => stopIds.get(orderId) ?? []),
      input.at,
    );
  }
  return {
    rounds: appliedRounds(input.rounds, targets, before),
    movedStops,
  };
}

/** Une commande, une tournée : une seule fois chacune dans la proposition. */
function ensureOnce(proposal: readonly ProposedComposition[]): void {
  const orders = proposal.flatMap((item) => item.orderIds);
  const twice = orders.find((orderId, index) => orders.indexOf(orderId) !== index);
  if (twice !== undefined) {
    throw new InvalidProposalError(`la commande ${twice} y figure deux fois`);
  }
  const rounds = proposal.flatMap((item) => item.roundId ?? []);
  const roundTwice = rounds.find((roundId, index) => rounds.indexOf(roundId) !== index);
  if (roundTwice !== undefined) {
    throw new InvalidProposalError(`la tournée ${roundTwice} y figure deux fois`);
  }
}

function holdersOf(
  rounds: ReadonlyMap<string, DeliveryRound>,
): ReadonlyMap<string, { readonly round: DeliveryRound; readonly stopId: string }> {
  return new Map(
    [...rounds.values()].flatMap((round) =>
      round.liveStops.map((stop) => [stop.orderId, { round, stopId: stop.id }] as const),
    ),
  );
}

function targetOf(item: ProposedComposition, input: ApplyProposalInput): Target {
  if (item.roundId === null) {
    return { round: input.open(item.vehicleId), item, opened: true };
  }
  const round = input.rounds.get(item.roundId);
  if (round === undefined) {
    throw new InvalidProposalError(`la tournée ${item.roundId} n'a pas été lue`);
  }
  if (round.vehicleId !== item.vehicleId) {
    throw new InvalidProposalError(
      `la tournée « ${round.vehicleName} » ne change pas de véhicule — ouvrez-en une autre`,
    );
  }
  return { round, item, opened: false };
}

/** Les tournées ouvertes, puis les existantes — sources comprises —, dans l'ordre des identifiants. */
function appliedRounds(
  rounds: ReadonlyMap<string, DeliveryRound>,
  targets: readonly Target[],
  before: ReadonlyMap<string, readonly string[]>,
): readonly AppliedRound[] {
  const opened = targets
    .filter((target) => target.opened)
    .map((target) => ({ round: target.round, before: [], opened: true }));
  const existing = [...rounds.values()]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((round) => ({ round, before: before.get(round.id) ?? [], opened: false }));
  return [...opened, ...existing];
}
