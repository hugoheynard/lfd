import { ResourceNotFoundError } from "../../../platform/shared/errors/app-error.js";

/**
 * La commande n'est pas au poste de ce jour : la liste du fournil ne l'a pas
 * encore apportée, son annulation l'a retirée, ou l'adresse porte un autre
 * jour. Rien à étiqueter — et rien d'inventé.
 */
export class BagLabelsSheetNotFoundError extends ResourceNotFoundError {
  constructor(serviceDay: string) {
    super(
      "packing.bag_labels.sheet_not_found",
      `Cette commande n'est pas au poste de colisage du ${serviceDay} : elle n'y est pas encore arrivée, ou son annulation l'a retirée. Revenez au poste et rouvrez la commande pour imprimer ses étiquettes.`,
    );
  }
}
