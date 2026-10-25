import type { DoorstepStop } from "../entities/doorstep-stop.js";

/**
 * L'arrêt à la porte (`a-la-porte.md`, AP-D6), chargé pour les gestes qui le
 * closent — l'exécution, jamais la tournée. Il n'écrit plus rien depuis que
 * « Je suis arrivé » est retiré (2026-10-25, décision de Hugo).
 */
export abstract class DoorstepStopRepository {
  /**
   * L'arrêt `stopId` de la tournée `roundId`, **sous le mur du livreur** :
   * `null` si la tournée n'est pas la sienne, ou si l'arrêt n'en est pas (ou
   * plus) — sans distinguer, on ne confirme rien.
   */
  abstract loadForDriver(
    roundId: string,
    stopId: string,
    staffUserId: string,
  ): Promise<DoorstepStop | null>;
}
