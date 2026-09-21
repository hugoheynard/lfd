import { BusinessError } from "../../../platform/shared/errors/app-error.js";

/**
 * **La livraison n'est pas ouverte aux particuliers** (409).
 *
 * ⚠️ Ce n'est pas une autorisation : le refus ne dit rien de la personne, tout
 * de ce que la maison a décidé de servir. D'où un refus métier (`409`) et non
 * un `403`, qui ferait chercher un droit manquant là où il n'y en a pas —
 * exactement la raison de {@link ShopClosedError}, à côté.
 *
 * 🔴 **Le mur est ICI et pas dans l'écran.** L'accueil cache la porte du
 * coursier quand la clé est fermée ; sans ce refus, une requête recopiée depuis
 * l'onglet réseau ferait livrer quand même, et l'admin qui a « fermé » la
 * livraison croirait l'avoir fermée. C'est la distinction que le catalogue des
 * clés écrit noir sur blanc : `hidden` ne ferme rien, `closed` si.
 *
 * Les PROS ne passent pas par ici : `POST /shop/orders` est la route des
 * commandes SANS compte. Leur livraison tient à leur contrat, pas à ce réglage.
 */
export class PublicDeliveryClosedError extends BusinessError {
  constructor() {
    super(
      "feature_access.public_delivery_closed",
      "La livraison n'est pas ouverte aux commandes sans compte.",
    );
  }
}
