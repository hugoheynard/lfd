import type { DeliveryColors } from "../../channels/commerce/index.js";

/**
 * **La couleur d'un arrêt de livraison** (plan
 * `commandes/back-office/tri-depart-et-couleurs.md`, §4 et L5) : la couleur de
 * livraison du site de départ pour sa clientèle. `null` — aucun carré —
 * quand la clientèle est inconnue (commande d'avant la distinction) ou que
 * la couleur n'est pas posée : jamais une teinte inventée.
 */
export function deliveryStopColor(
  clientele: "pro" | "public" | null,
  colors: DeliveryColors,
): string | null {
  if (clientele === null) {
    return null;
  }
  return clientele === "pro" ? colors.pro : colors.public;
}
