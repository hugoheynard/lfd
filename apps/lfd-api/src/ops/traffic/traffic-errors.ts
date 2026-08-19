import { TechnicalError } from "../../platform/shared/errors/app-error.js";

/**
 * La lecture du trafic a échoué — réseau, jeton refusé, requête rejetée.
 *
 * **Technique et non métier** : rien du domaine n'est en cause, et surtout rien
 * n'est cassé côté production. C'est la carte de santé qui ne voit plus, pas le
 * système qui tombe. La distinction compte le jour où elle se produit : on ne
 * doit pas partir chercher un incident qui n'existe pas.
 */
export class TrafficUnavailableError extends TechnicalError {
  constructor(message: string, cause?: unknown) {
    super("ops.traffic_unavailable", message, cause);
  }
}
