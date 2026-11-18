import { quantityFigure, saleQuantity } from "@lfd/money";

import { BusinessError } from "../../../platform/shared/errors/app-error.js";
import type { AllReadyShortage } from "../services/all-ready.js";

/**
 * **Les refus de « Tout est prêt »** (plan des niveaux de suivi du colisage,
 * D4) : une commande à retirer, colisée au niveau simple, que le poste
 * déclare prête d'un geste.
 */

/**
 * « Tout est prêt » sur une fiche qui n'est pas un retrait au niveau simple :
 * une livraison, un réassort ou un retrait détaillé se colisent contenant par
 * contenant, puis « Déclarer prête ».
 */
export class AllReadyOutsideSimplePickupError extends BusinessError {
  constructor(reference: string) {
    super(
      "packing.all_ready.not_simple_pickup",
      `La commande ${reference} se colise en détail (livraison, ou retrait réglé en suivi détaillé) : « Tout est prêt » ne s'y applique pas. Répartissez ses produits dans ses contenants, puis « Déclarer prête ».`,
    );
  }
}

/**
 * Le four n'a pas encore remis tout ce que la commande demande : la réserve
 * libre ne couvre pas ce qui reste à mettre au sac. Rien n'est écrit.
 */
export class AllReadyNotArrivedError extends BusinessError {
  constructor(reference: string, shortages: readonly AllReadyShortage[]) {
    const named = shortages
      .map(
        (shortage) =>
          `${quantityFigure(saleQuantity(shortage.missing, shortage.saleUnit))} « ${shortage.productName} »`,
      )
      .join(", ");
    super(
      "packing.all_ready.not_arrived",
      `La commande ${reference} n'est pas complète au colisage : il manque ${named}. Rien n'a été mis au sac ; attendez que le four les remette, ou signalez « Problème ».`,
    );
  }
}
