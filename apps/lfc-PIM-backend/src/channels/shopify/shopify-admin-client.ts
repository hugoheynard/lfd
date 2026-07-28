import { Injectable } from '@nestjs/common';

import { AppConfig } from '../../infra/config/app-config.js';
import {
  ShopifyNotConfiguredError,
  ShopifyRejectedError,
  ShopifyTransportError,
} from './shopify-errors.js';
import type {
  DesiredCollection,
  ShopifyCollection,
} from './shopify-reconcile.js';
import { ShopifySettingsService } from './shopify-settings.service.js';

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

/** Un nœud collection tel que renvoyé par l'API Admin. */
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

/**
 * Transport **réel** vers l'API Admin GraphQL de Shopify. Isolé ici pour la raison
 * annoncée par le port {@link ShopifyDriver} : c'est le seul endroit qui connaît la
 * forme des mutations et la version d'API. Le domaine de la boutique et la version
 * viennent des réglages (en base) ; le jeton vient de l'environnement (secret, jamais
 * en base). Sans domaine ni jeton, on refuse plutôt que d'émettre un appel bancal.
 */
@Injectable()
export class ShopifyAdminClient {
  constructor(
    private readonly settings: ShopifySettingsService,
    private readonly config: AppConfig,
  ) {}

  /** Confirme que le couple (domaine, jeton) parle bien à une boutique. */
  async verify(): Promise<ShopifyShopIdentity> {
    const data = await this.query<{
      shop: { name: string; myshopifyDomain: string };
    }>('query { shop { name myshopifyDomain } }');
    return { name: data.shop.name, domain: data.shop.myshopifyDomain };
  }

  /** Les collections `tva-*` présentes sur la boutique (paginées). */
  async listTvaCollections(): Promise<ShopifyCollection[]> {
    const collections: ShopifyCollection[] = [];
    let cursor: string | null = null;

    do {
      const page: CollectionsPage = await this.query<CollectionsPage>(
        LIST_COLLECTIONS_QUERY,
        { cursor },
      );

      for (const node of page.collections.nodes) {
        if (node.handle.startsWith('tva-')) {
          collections.push({
            id: node.id,
            handle: node.handle,
            title: node.title,
            productCount: node.productsCount?.count ?? 0,
          });
        }
      }

      cursor = page.collections.pageInfo.hasNextPage
        ? page.collections.pageInfo.endCursor
        : null;
    } while (cursor !== null);

    return collections;
  }

  /** Crée une collection **manuelle** vide (pas de `ruleSet`). */
  async createCollection(
    target: DesiredCollection,
  ): Promise<ShopifyCollection> {
    const data = await this.query<{
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
        userErrors.map((error) => error.message).join(' ; ') ||
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

  private async query<T>(
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<T> {
    const endpoint = await this.endpoint();
    const token = this.config.shopifyAdminToken();
    if (token === null) {
      throw new ShopifyNotConfiguredError(
        'Jeton Admin Shopify absent (SHOPIFY_ADMIN_TOKEN).',
      );
    }

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token,
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (cause) {
      throw new ShopifyTransportError('Boutique Shopify injoignable.', cause);
    }

    if (!response.ok) {
      throw new ShopifyTransportError(
        `Shopify a répondu ${response.status} ${response.statusText}.`,
      );
    }

    const body = (await response.json()) as GraphQlResponse<T>;
    if (body.errors !== undefined && body.errors.length > 0) {
      throw new ShopifyTransportError(
        body.errors.map((error) => error.message).join(' ; '),
      );
    }
    if (body.data === undefined) {
      throw new ShopifyTransportError('Réponse Shopify sans données.');
    }
    return body.data;
  }

  private async endpoint(): Promise<string> {
    const { shopDomain, apiVersion } = await this.settings.read();
    if (shopDomain.trim() === '') {
      throw new ShopifyNotConfiguredError(
        'Domaine de boutique manquant — renseignez-le dans les réglages.',
      );
    }
    return `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`;
  }
}

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
