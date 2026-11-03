import { ResourceNotFoundError } from "../../../platform/shared/errors/app-error.js";

/**
 * La commande n'est sur aucune liste à coliser : le plan de sa journée n'est
 * pas encore arrêté, elle est hors plan, ou son annulation a retiré sa
 * feuille. Le rail du comptoir le lit comme « aucune fiche » et n'invente
 * aucune coche.
 */
export class CounterPackingSheetNotFoundError extends ResourceNotFoundError {
  constructor() {
    super(
      "packing.counter.sheet_not_found",
      "Cette commande n'a pas encore de fiche de colis : le plan de sa journée n'est pas arrêté, ou elle n'y figure pas. Le contenu du sac se vérifie à la main avant de la remettre.",
    );
  }
}
