import type { Subscription } from "../entities/subscription.js";
import type { IsoDate } from "../value-objects/iso-date.js";

/**
 * **Les paniers que le planificateur parcourt**, sans mur de personne : la
 * machine les sert tous. Actifs, d'une société, commencés avant la fin de
 * l'horizon et pas finis avant aujourd'hui ; au plus `limit`, les plus
 * anciens d'abord, pour qu'un balayage reste borné.
 *
 * Le périmètre fin (payeur public, borne basse, calendrier) se juge ensuite,
 * sur l'agrégat et à la passation.
 */
export abstract class PlannerSubscriptions {
  abstract inHorizon(
    today: IsoDate,
    horizonEnd: IsoDate,
    limit: number,
  ): Promise<readonly Subscription[]>;
}
