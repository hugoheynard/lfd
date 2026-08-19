import { Injectable, Logger } from "@nestjs/common";

import { ShopifyAdminClient, ShopifyRejectedError } from "@lfd/shopify-admin";
import { buildProductSetInput } from "./product-set-input.js";
import type { ShopifyProductPayload } from "./projection.js";

export interface ShopifyPushResult {
  readonly productGid: string | null;
  /** `sku` → identifiant Shopify de la variante. */
  readonly variantGids: Readonly<Record<string, string>>;
}

/**
 * Transport vers Shopify. Isolé derrière un port : deux réalisations, choisies par le
 * mode du canal — {@link DryRunShopifyDriver} (aucun appel) et {@link LiveShopifyDriver}
 * (mutation `productSet` réelle). Le service de push sélectionne selon les réglages.
 */
export abstract class ShopifyDriver {
  abstract readonly mode: "live" | "dry-run";
  abstract push(payload: ShopifyProductPayload): Promise<ShopifyPushResult>;
}

/**
 * Pilote par défaut : **ne contacte rien**. Il valide toute la chaîne — lecture,
 * projection, empreinte, écriture du binding — sans dépendre d'un compte Shopify.
 *
 * Ce n'est pas un bouchon vide : c'est le mode dans lequel l'intégration tourne tant
 * qu'aucun jeton n'est fourni, et il rend le comportement observable dès maintenant.
 */
@Injectable()
export class DryRunShopifyDriver extends ShopifyDriver {
  readonly mode = "dry-run" as const;
  private readonly logger = new Logger(DryRunShopifyDriver.name);

  push(payload: ShopifyProductPayload): Promise<ShopifyPushResult> {
    this.logger.log(
      `[simulation] ${payload.handle} — ${payload.variants.length} déclinaison(s), statut ${payload.status}`,
    );
    return Promise.resolve({ productGid: null, variantGids: {} });
  }
}

/** Un nœud variante tel que renvoyé par `productSet`. */
interface ProductSetVariantNode {
  readonly id: string;
  readonly sku: string | null;
}

interface ProductSetResponse {
  readonly productSet: {
    readonly product: {
      readonly id: string;
      readonly handle: string;
      readonly variants: { readonly nodes: readonly ProductSetVariantNode[] };
    } | null;
    readonly userErrors: readonly {
      readonly field: readonly string[] | null;
      readonly message: string;
    }[];
  };
}

/**
 * Pilote **réel** : pousse via la mutation `productSet`, **upsert par handle** — le même
 * produit re-poussé se met à jour au lieu de se dupliquer (c'est ce qui protège la
 * boutique du doublon). Il réutilise le transport authentifié de l'`admin-client` ; la
 * forme de *cette* mutation vit ici, près de son domaine.
 */
@Injectable()
export class LiveShopifyDriver extends ShopifyDriver {
  readonly mode = "live" as const;

  constructor(private readonly client: ShopifyAdminClient) {
    super();
  }

  async push(payload: ShopifyProductPayload): Promise<ShopifyPushResult> {
    const data = await this.client.graphql<ProductSetResponse>(PRODUCT_SET_MUTATION, {
      // Upsert par handle : `identifier: { handle }` crée si absent, met à jour sinon
      // (vérifié live, cf. shopify-productset-findings.md F1/F5).
      identifier: { handle: payload.handle },
      input: buildProductSetInput(payload),
    });

    const { product, userErrors } = data.productSet;
    if (userErrors.length > 0 || product === null) {
      throw new ShopifyRejectedError(
        userErrors.map((error) => error.message).join(" ; ") ||
          `Push refusé pour « ${payload.handle} ».`,
      );
    }

    const variantGids: Record<string, string> = {};
    for (const node of product.variants.nodes) {
      if (node.sku !== null && node.sku !== "") {
        variantGids[node.sku] = node.id;
      }
    }
    return { productGid: product.id, variantGids };
  }
}

const PRODUCT_SET_MUTATION = `
  mutation ProductSet($identifier: ProductSetIdentifiers, $input: ProductSetInput!) {
    productSet(identifier: $identifier, input: $input, synchronous: true) {
      product {
        id
        handle
        variants(first: 100) { nodes { id sku } }
      }
      userErrors { field message }
    }
  }
`;
