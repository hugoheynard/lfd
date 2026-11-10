import { TypicalBuyer, type TypicalClientele } from "../../promotions/domain/lot-buyer.js";

/**
 * **La fabrique du pro type** (`plan-export-grille-de-prix.md`, § 8.1) — dans
 * le module d'export, et nulle part ailleurs.
 *
 * `lint:typical-buyer` tient le mur : ce fichier n'est importé en valeur que
 * par `lafoliecoffee/pricing/application/price-grid-*`, et lui seul importe en valeur
 * `TypicalBuyer`. L'export est servi sous `b2b_pricing:read` ; aucune route de
 * la boutique ne peut donc tarifer « une société active » qui n'existe pas.
 */
export function priceGridTypicalBuyer(clientele: TypicalClientele): TypicalBuyer {
  return TypicalBuyer.of(clientele);
}
