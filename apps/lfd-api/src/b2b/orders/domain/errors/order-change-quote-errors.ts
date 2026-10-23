import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Le devis d'une demande refusé** (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, §14) : il n'est
 * ouvert qu'à une commande dont l'heure limite est passée et qui n'est pas au
 * plan — celle qu'on peut DEMANDER à modifier. Les blocages communs (carte,
 * engagée, annulée…) gardent leur propre erreur.
 */
export class OrderChangeNotQuotableError extends BusinessError {
  constructor(orderNumber: string, situation: "still_revisable" | "in_preparation") {
    super(
      `orders.change_quote.${situation}`,
      situation === "still_revisable"
        ? `La commande ${orderNumber} se modifie encore directement : utiliser « Modifier ma commande », qui chiffre et applique tout de suite.`
        : `La commande ${orderNumber} est déjà en préparation au fournil : elle ne se modifie plus, même sur demande. Nous écrire depuis « Nous contacter ».`,
    );
  }
}
