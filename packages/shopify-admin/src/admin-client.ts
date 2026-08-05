import type { DesiredCollection, ShopifyCollection } from "./collection-types.js";
import {
  ShopifyNotConfiguredError,
  ShopifyRejectedError,
  ShopifyTransportError,
} from "./errors.js";
import type { ShopifyProductSnapshot } from "./product-snapshot.js";
import type { ShopifyStoreSettings } from "./store-settings.js";
import type { ShopifyTokenProvider } from "./token-provider.js";

/** Ce que confirme une vérification de connexion. */
export interface ShopifyShopIdentity {
  readonly name: string;
  readonly domain: string;
}

interface GraphQlResponse<T> {
  readonly data?: T;
  readonly errors?: ReadonlyArray<{ readonly message: string }>;
}

interface UserError {
  readonly field: readonly string[] | null;
  readonly message: string;
}

interface CollectionNode {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly productsCount: { readonly count: number } | null;
}

interface CollectionsPage {
  readonly collections: {
    readonly nodes: readonly CollectionNode[];
    readonly pageInfo: {
      readonly hasNextPage: boolean;
      readonly endCursor: string | null;
    };
  };
}

interface ProductNode {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly status: string;
  readonly variants: {
    readonly nodes: readonly {
      readonly sku: string | null;
      readonly title: string;
      readonly price: string | null;
    }[];
  };
}

interface ProductsPage {
  readonly products: {
    readonly nodes: readonly ProductNode[];
    readonly pageInfo: {
      readonly hasNextPage: boolean;
      readonly endCursor: string | null;
    };
  };
}

/**
 * Transport **réel** vers l'API Admin GraphQL de Shopify — le seul endroit qui
 * connaît la forme des requêtes et la version d'API. Le domaine de la boutique et
 * la version viennent du port {@link ShopifyStoreSettings} ; le jeton du
 * {@link ShopifyTokenProvider} (secret, jamais en base). Sans domaine ni jeton,
 * on refuse plutôt que d'émettre un appel bancal.
 */
export class ShopifyAdminClient {
  constructor(
    private readonly settings: ShopifyStoreSettings,
    private readonly tokens: ShopifyTokenProvider,
  ) {}

  /** Confirme que le couple (domaine, jeton) parle bien à une boutique. */
  async verify(): Promise<ShopifyShopIdentity> {
    const data = await this.graphql<{
      shop: { name: string; myshopifyDomain: string };
    }>("query { shop { name myshopifyDomain } }");
    return { name: data.shop.name, domain: data.shop.myshopifyDomain };
  }

  /** L'état **actuel** du catalogue de la boutique — tous les produits, paginés. */
  async listProducts(): Promise<ShopifyProductSnapshot[]> {
    const products: ShopifyProductSnapshot[] = [];
    let cursor: string | null = null;

    do {
      const page: ProductsPage = await this.graphql<ProductsPage>(LIST_PRODUCTS_QUERY, { cursor });

      for (const node of page.products.nodes) {
        products.push({
          id: node.id,
          handle: node.handle,
          title: node.title,
          status: node.status,
          variants: node.variants.nodes.map((variant) => ({
            sku: variant.sku,
            title: variant.title,
            price: variant.price,
          })),
        });
      }

      cursor = page.products.pageInfo.hasNextPage ? page.products.pageInfo.endCursor : null;
    } while (cursor !== null);

    return products;
  }

  /** Les collections `tva-*` présentes sur la boutique (paginées). */
  async listTvaCollections(): Promise<ShopifyCollection[]> {
    const collections: ShopifyCollection[] = [];
    let cursor: string | null = null;

    do {
      const page: CollectionsPage = await this.graphql<CollectionsPage>(LIST_COLLECTIONS_QUERY, {
        cursor,
      });

      for (const node of page.collections.nodes) {
        if (node.handle.startsWith("tva-")) {
          collections.push({
            id: node.id,
            handle: node.handle,
            title: node.title,
            productCount: node.productsCount?.count ?? 0,
          });
        }
      }

      cursor = page.collections.pageInfo.hasNextPage ? page.collections.pageInfo.endCursor : null;
    } while (cursor !== null);

    return collections;
  }

  /** Crée une collection **manuelle** vide (pas de `ruleSet`). */
  async createCollection(target: DesiredCollection): Promise<ShopifyCollection> {
    const data = await this.graphql<{
      collectionCreate: {
        collection: {
          id: string;
          handle: string;
          title: string;
          productsCount: { count: number } | null;
        } | null;
        userErrors: readonly UserError[];
      };
    }>(CREATE_COLLECTION_MUTATION, {
      input: { title: target.title, handle: target.handle },
    });

    const { collection, userErrors } = data.collectionCreate;
    if (userErrors.length > 0 || collection === null) {
      throw new ShopifyRejectedError(
        userErrors.map((error) => error.message).join(" ; ") ||
          `Création refusée pour « ${target.handle} ».`,
      );
    }

    return {
      id: collection.id,
      handle: collection.handle,
      title: collection.title,
      productCount: collection.productsCount?.count ?? 0,
    };
  }

  /**
   * Range des produits dans une collection **manuelle** (`collectionAddProductsV2`).
   * Idempotent côté Shopify : ré-ajouter un produit déjà membre est sans effet. La
   * mutation est asynchrone (renvoie un `job`) ; à volume de boulangerie on n'attend
   * pas sa complétion — l'appartenance se matérialise dans la foulée.
   */
  async addProductsToCollection(
    collectionId: string,
    productIds: readonly string[],
  ): Promise<void> {
    if (productIds.length === 0) {
      return;
    }
    const data = await this.graphql<{
      collectionAddProductsV2: {
        job: { id: string } | null;
        userErrors: readonly UserError[];
      };
    }>(COLLECTION_ADD_PRODUCTS_MUTATION, { id: collectionId, productIds });

    const { userErrors } = data.collectionAddProductsV2;
    if (userErrors.length > 0) {
      throw new ShopifyRejectedError(
        userErrors.map((error) => error.message).join(" ; ") ||
          `Ajout à la collection « ${collectionId} » refusé.`,
      );
    }
  }

  /**
   * Transport GraphQL **authentifié** vers l'API Admin — jeton, endpoint, erreurs.
   * Public pour que les adaptateurs (drivers de push) réutilisent le transport sans
   * dupliquer l'auth ; eux portent la forme de *leur* mutation, ici on ne fait que
   * l'envoyer.
   */
  async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const { shopDomain, apiVersion } = await this.settings.read();
    const domain = shopDomain.trim();
    if (domain === "") {
      throw new ShopifyNotConfiguredError(
        "Domaine de boutique manquant — renseignez-le dans les réglages.",
      );
    }
    const token = await this.tokens.accessTokenFor(domain);
    const endpoint = `https://${domain}/admin/api/${apiVersion}/graphql.json`;

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (cause) {
      throw new ShopifyTransportError("Boutique Shopify injoignable.", cause);
    }

    if (!response.ok) {
      throw new ShopifyTransportError(
        `Shopify a répondu ${response.status} ${response.statusText}.`,
      );
    }

    const body = (await response.json()) as GraphQlResponse<T>;
    if (body.errors !== undefined && body.errors.length > 0) {
      throw new ShopifyTransportError(body.errors.map((error) => error.message).join(" ; "));
    }
    if (body.data === undefined) {
      throw new ShopifyTransportError("Réponse Shopify sans données.");
    }
    return body.data;
  }
}

const LIST_PRODUCTS_QUERY = `
  query Products($cursor: String) {
    products(first: 50, after: $cursor) {
      nodes {
        id
        handle
        title
        status
        variants(first: 100) {
          nodes { sku title price }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const LIST_COLLECTIONS_QUERY = `
  query Collections($cursor: String) {
    collections(first: 250, after: $cursor) {
      nodes { id handle title productsCount { count } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const CREATE_COLLECTION_MUTATION = `
  mutation CreateCollection($input: CollectionInput!) {
    collectionCreate(input: $input) {
      collection { id handle title productsCount { count } }
      userErrors { field message }
    }
  }
`;

const COLLECTION_ADD_PRODUCTS_MUTATION = `
  mutation CollectionAddProducts($id: ID!, $productIds: [ID!]!) {
    collectionAddProductsV2(id: $id, productIds: $productIds) {
      job { id }
      userErrors { field message }
    }
  }
`;
