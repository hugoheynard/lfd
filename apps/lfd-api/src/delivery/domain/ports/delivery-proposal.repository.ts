import type { DeliveryRound } from "../entities/delivery-round.js";

/** Un arrêt existant qui change de tournée, et le véhicule qu'il quitte — pour nommer le refus. */
export interface MovedStop {
  readonly stopId: string;
  readonly fromVehicleName: string;
}

/** Ce qu'une proposition appliquée écrit. */
export interface ProposalWrite {
  /** Les tournées existantes touchées (sources comprises) et les tournées ouvertes. */
  readonly rounds: readonly DeliveryRound[];
  /** Les arrêts existants qui changent de tournée. */
  readonly movedStops: readonly MovedStop[];
}

/**
 * Port d'**écriture** d'une proposition appliquée (L7-C11) — N tournées, un
 * ordre, tout revérifié, une seule transaction.
 *
 * L'adaptateur verrouille TOUTES les tournées existantes, triées par
 * identifiant, puis les chargements de TOUS les arrêts déplacés, dans l'ordre
 * de leur identifiant ; revérifie sous verrou la version lue, la tournée non
 * partie, l'arrêt non chargé ; ouvre les tournées neuves. Un seul refus annule
 * tout.
 *
 * @throws {DeliveryRoundStaleError} une version n'est plus celle lue.
 * @throws {DeliveryRoundDepartedError} une tournée est partie entre-temps.
 * @throws {LoadedStopMoveError} un arrêt déplacé a un sac chargé.
 * @throws {ProposalOutdatedError} un passage a été pris par une autre ouverture.
 * @throws {OrderAlreadyInRoundError} l'index I3 a vu une commande placée ailleurs.
 */
export abstract class DeliveryProposalRepository {
  abstract applyProposal(write: ProposalWrite): Promise<void>;
}
