import type { DoorstepStop } from "../entities/doorstep-stop.js";

/**
 * Port d'**écriture** de l'arrêt à la porte (`plan-a-la-porte.md`, AP-D6) —
 * l'exécution, jamais la tournée.
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

  /**
   * Écrit l'arrivée — seulement si aucune n'est encore écrite : deux appareils
   * qui arrivent ensemble gardent le premier instant, jamais le second.
   */
  abstract save(stop: DoorstepStop): Promise<void>;
}
