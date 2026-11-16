import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/**
 * La simulation du catalogue n'a pas pu lire ce qu'il faut pour ranger dans
 * le mode demandé. Le dossier du jour, lui, se tire dégradé ; une simulation
 * dégradée montrerait un rangement qui n'est pas celui qu'on a demandé à voir,
 * donc elle se refuse.
 */
export class SimulationGroupingUnreadableError extends TechnicalError {
  constructor(unreadable: string) {
    super(
      "production.simulation.grouping_unreadable",
      `La simulation du catalogue n'a pas pu lire les ${unreadable} : elle ne rangerait pas comme demandé. Réessayez dans un instant ; si le refus persiste, signalez-le avec l'heure.`,
    );
  }
}
