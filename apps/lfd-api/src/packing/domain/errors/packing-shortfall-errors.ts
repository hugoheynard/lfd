import { BusinessError } from "../../../platform/shared/errors/app-error.js";

/**
 * **« Il manque » sur un bac complet** (lot E6a, plan
 * `documentation/commandes/plan-e6-le-depart-incomplet.md`, § 3) : toutes les
 * lignes dues sont entièrement réparties, il n'y a rien à signaler.
 */
export class NothingShortError extends BusinessError {
  constructor(reference: string) {
    super(
      "packing.shortfall.nothing_short",
      `Toutes les lignes de ${reference} sont entièrement au bac : il ne manque rien. Déclarez-la prête ; si une pièce est abîmée, retirez-la d'abord du contenant, puis signalez le manque.`,
    );
  }
}
