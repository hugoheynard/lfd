import { BusinessError } from "../../../platform/shared/errors/app-error.js";

/**
 * **Le plan de la journée a été rouvert** au Prod manager, pendant ou avant ce
 * geste (audit du réassort, 2026-11-02). Les arrêts de commande vont sortir
 * des tournées ; charger un bac ou faire partir une tournée y appuierait un
 * départ sur un plan effacé. Une journée jamais arrêtée n'est PAS refusée :
 * la livraison n'a jamais exigé l'arrêt.
 */
export class DeliveryPlanReopenedError extends BusinessError {
  constructor(serviceDay: string) {
    super(
      "delivery.plan_reopened",
      `Le plan de production du ${serviceDay} a été rouvert : ses commandes vont sortir des tournées, et rien n'a été enregistré. Réarrêtez la journée au Prod manager, puis recommencez le geste.`,
    );
  }
}
