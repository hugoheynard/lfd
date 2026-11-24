import type { Basket } from "../../../basket/domain/entities/basket.js";
import type { IsoDate } from "../../../basket/domain/value-objects/iso-date.js";

/**
 * **Les paniers dont la création à l'avance est en retard** : servis (actifs,
 * d'une société), pas finis avant `today`, et planifiés moins loin que
 * `horizon` — au plus `limit`, les moins avancés d'abord. Sans mur de
 * personne : c'est la machine qui planifie.
 */
export abstract class BasketsBehindPlan {
  abstract behind(today: IsoDate, horizon: IsoDate, limit: number): Promise<readonly Basket[]>;
}
