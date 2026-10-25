import { ResourceNotFoundError } from "../../../platform/shared/errors/app-error.js";

/**
 * Aucun bac vivant à étiqueter : la commande (ou le transfert) n'en a pas
 * déclaré, ou les bacs demandés ont été annulés depuis que l'écran les a
 * montrés. Un PDF sans page ne s'imprime pas ; on le dit.
 */
export class BinLabelsNothingToPrintError extends ResourceNotFoundError {
  constructor(title: string) {
    super(
      "delivery.bin_labels.nothing_to_print",
      `Aucun bac à étiqueter pour ${title} : il n'en a pas de déclaré, ou celui demandé a été annulé. Rechargez l'écran, puis imprimez l'étiquette d'un bac encore vivant.`,
    );
  }
}
