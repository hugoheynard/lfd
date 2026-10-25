import { BusinessError, ResourceNotFoundError } from "../../../platform/shared/errors/app-error.js";

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

/**
 * La commande n'a plus aucun sac vivant : il n'y a rien à étiqueter. Un PDF
 * sans page ne s'imprime pas ; on le dit plutôt que de rendre une feuille
 * blanche.
 */
export class BagLabelsNoBagError extends BusinessError {
  constructor(reference: string) {
    super(
      "packing.bag_labels.no_bag",
      `La commande ${reference} n'a aucun sac au poste : ouvrez un sac sur la commande, puis imprimez son étiquette.`,
    );
  }
}

/**
 * Aucun des sacs demandés n'est vivant sur la commande : annulé depuis que
 * l'écran l'a montré, ou d'une autre commande. Rien n'est imprimé à sa place.
 */
export class BagLabelsBagNotFoundError extends ResourceNotFoundError {
  constructor(reference: string) {
    super(
      "packing.bag_labels.bag_not_found",
      `Ce sac n'est plus sur la commande ${reference} — il a sans doute été annulé. Rechargez le poste, puis imprimez l'étiquette d'un sac encore sur la table.`,
    );
  }
}
