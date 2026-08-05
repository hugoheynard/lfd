/**
 * Instantané **lecture seule** d'un produit tel qu'il existe *aujourd'hui* sur la
 * boutique Shopify — le miroir de l'état distant, jamais une source canonique.
 * Forme volontairement plate : ce que le tableau d'inspection affiche.
 */
export interface ShopifyProductSnapshot {
  /** GID Shopify (`gid://shopify/Product/…`). */
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  /** `ACTIVE` | `DRAFT` | `ARCHIVED` — tel que renvoyé par l'API Admin. */
  readonly status: string;
  readonly variants: readonly ShopifyVariantSnapshot[];
}

export interface ShopifyVariantSnapshot {
  /** Peut manquer côté Shopify : une variante n'a pas toujours de SKU. */
  readonly sku: string | null;
  readonly title: string;
  /** Prix en chaîne (Shopify sérialise les montants en décimal texte). */
  readonly price: string | null;
}
