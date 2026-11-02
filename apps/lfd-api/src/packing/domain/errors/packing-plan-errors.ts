import { BusinessError } from "../../../platform/shared/errors/app-error.js";

/**
 * **Le plan de la journée n'est plus arrêté** : il a été rouvert au Prod
 * manager pendant ou avant ce geste (audit du réassort, 2026-11-02). La liste
 * à coliser de la journée va être retirée ; ouvrir un sac, mettre au bac ou
 * clore une fiche y appuierait un colisage sur un plan effacé.
 */
export class PackingPlanReopenedError extends BusinessError {
  constructor(serviceDay: string) {
    super(
      "packing.plan_reopened",
      `Le plan de production du ${serviceDay} a été rouvert : il n'y a plus de liste à coliser pour cette journée, et rien n'a été enregistré. Réarrêtez la journée au Prod manager, puis recommencez le geste.`,
    );
  }
}
