/** Les quatre couleurs d'un site, chacune `#rrggbb` ou `null` (non posée). */
export interface SiteColorSet {
  readonly pickupColorB2b: string | null;
  readonly pickupColorB2c: string | null;
  readonly deliveryColorB2b: string | null;
  readonly deliveryColorB2c: string | null;
}

/**
 * **La couleur d'une commande** (plan `commandes/back-office/plan-tri-depart-et-couleurs.md`,
 * §4) : un retrait prend la couleur de retrait de SON site, une livraison
 * celle de livraison du site de DÉPART — chacune selon la clientèle.
 *
 * `site` est celui que l'appelant a résolu selon le mode ; `null` — retrait
 * d'avant le site (S2), aucun départ — ou clientèle inconnue : `null`, jamais
 * une couleur inventée.
 */
export function orderCategoryColor(
  method: "pickup" | "delivery",
  clientele: "pro" | "public" | null,
  site: SiteColorSet | null,
): string | null {
  if (clientele === null || site === null) {
    return null;
  }
  if (method === "pickup") {
    return clientele === "pro" ? site.pickupColorB2b : site.pickupColorB2c;
  }
  return clientele === "pro" ? site.deliveryColorB2b : site.deliveryColorB2c;
}
