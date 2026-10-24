import type { RunSheetDeliveryColors } from "../../channels/commerce/index.js";

/**
 * **La couleur d'un arrêt de la feuille de route** (plan
 * `commandes/back-office/plan-tri-depart-et-couleurs.md`, §4 et L5) : la couleur de
 * livraison du site de départ pour la clientèle de la commande. `null` —
 * aucun carré — quand la clientèle est inconnue ou la couleur non posée :
 * jamais une teinte inventée.
 */
export function runSheetColorOf(
  clientele: "pro" | "public" | null,
  colors: RunSheetDeliveryColors,
): string | null {
  if (clientele === null) {
    return null;
  }
  return clientele === "pro" ? colors.pro : colors.public;
}
