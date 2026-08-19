import { createHash } from "node:crypto";

import type { ProductRecord } from "../../../catalogue/domain/ports/product.repository.js";

/**
 * Projection canonique → vocabulaire Shopify. **Pure et testable** : aucun appel réseau,
 * aucune dépendance Nest.
 *
 * C'est la pièce qui a de la valeur. Le transport (quelle mutation, quelle version d'API)
 * changera ; ce que *signifie* « ce produit chez Shopify » ne changera pas.
 */
export interface ShopifyVariantPayload {
  readonly sku: string;
  readonly title: string;
  readonly options: Readonly<Record<string, string>>;
  /** Prix décimal en chaîne (`"1.30"`), comme Shopify le sérialise ; `null` = non tarifé. */
  readonly price: string | null;
}

export interface ShopifyProductPayload {
  readonly title: string;
  readonly handle: string;
  readonly status: "DRAFT" | "ACTIVE";
  readonly variants: readonly ShopifyVariantPayload[];
}

export function projectProduct(product: ProductRecord): ShopifyProductPayload {
  return {
    title: product.name.fr,
    handle: product.slug.fr,
    // Un brouillon reste un brouillon : on ne met jamais en ligne par inadvertance.
    status: product.status === "published" ? "ACTIVE" : "DRAFT",
    variants: product.variants
      .filter((variant) => !variant.isDiscontinued)
      .map((variant) => ({
        sku: variant.sku,
        title: variant.name.fr,
        options: variant.options,
        // Centimes canoniques → décimal texte que l'API Admin attend ("130" → "1.30").
        price: variant.priceCents === null ? null : (variant.priceCents / 100).toFixed(2),
      })),
  };
}

/**
 * Empreinte de ce qui a été poussé.
 *
 * Elle permet deux choses : **ne pas repousser** ce qui n'a pas bougé (le canal a des
 * quotas d'appels), et **détecter une dérive** — si l'empreinte du catalogue diffère de
 * la dernière poussée, quelque chose a changé d'un côté ou de l'autre.
 *
 * Les clés sont triées : deux objets équivalents doivent produire la **même** empreinte,
 * sans quoi tout paraîtrait modifié en permanence.
 */
export function fingerprint(payload: ShopifyProductPayload): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
