import { Inject, Injectable } from '@nestjs/common';

import type { ShopifyOAuthCredentials } from '../../../infra/config/app-config.js';
import { ShopifyNotConfiguredError, ShopifyTransportError } from './errors.js';

/**
 * D'où viennent les identifiants d'authentification — vue **étroite** de
 * `AppConfig` (ISP) : le provider n'a pas besoin de tout l'environnement, seulement
 * de ces deux sources. Dépendre du port plutôt que de la classe concrète (DIP) rend
 * l'échange testable sans toucher `process.env` (interdit hors `AppConfig`).
 */
export interface ShopifyCredentialsSource {
  shopifyAdminToken(): string | null;
  shopifyOAuthCredentials(): ShopifyOAuthCredentials | null;
}

/** Jeton d'injection du port ci-dessus — aliasé sur `AppConfig` dans le module. */
export const SHOPIFY_CREDENTIALS_SOURCE = Symbol('SHOPIFY_CREDENTIALS_SOURCE');

/** Marge avant l'expiration annoncée : on rafraîchit un peu en avance pour ne
 *  jamais présenter à Shopify un jeton qui vient d'expirer (latence, horloges). */
const REFRESH_MARGIN_MS = 60_000;

/** TTL de repli si Shopify n'annonce pas `expires_in` (il le fait toujours : 86399). */
const FALLBACK_TTL_SECONDS = 86_399;

interface CachedToken {
  readonly domain: string;
  readonly value: string;
  /** Epoch (ms) au-delà duquel le jeton n'est plus considéré comme valide. */
  readonly expiresAt: number;
}

/** Réponse du *client credentials grant*. Les deux champs sont optionnels côté
 *  transport : on ne fait confiance qu'après les avoir validés. */
interface TokenGrantResponse {
  readonly access_token?: string;
  readonly expires_in?: number;
}

/**
 * Fournit le jeton d'accès à l'API Admin — la seule source de vérité sur « comment
 * on s'authentifie ». Deux chemins, dans cet ordre de priorité :
 *
 *  1. **`SHOPIFY_ADMIN_TOKEN`** — jeton statique d'une *legacy custom app* (créée
 *     dans l'admin avant le 01/01/2026). Honoré tel quel : aucun échange, pas
 *     d'expiration à gérer.
 *  2. **`SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET`** — *client credentials grant*.
 *     Depuis que Shopify n'affiche plus de jeton pour les apps du Dev Dashboard,
 *     c'est le seul chemin restant : le backend échange ses identifiants contre un
 *     jeton valable 24 h, gardé **en mémoire** et rafraîchi à l'expiration.
 *
 * Le jeton — statique ou échangé — ne touche **jamais** la base : un secret en base
 * fuite par les sauvegardes, les exports et les logs (même raison que le token legacy).
 */
@Injectable()
export class ShopifyTokenProvider {
  private cached: CachedToken | null = null;

  constructor(
    @Inject(SHOPIFY_CREDENTIALS_SOURCE)
    private readonly config: ShopifyCredentialsSource,
  ) {}

  /** Un jeton d'accès valide pour `shopDomain` (échange + mise en cache si besoin). */
  async accessTokenFor(shopDomain: string): Promise<string> {
    const staticToken = this.config.shopifyAdminToken();
    if (staticToken !== null) {
      return staticToken;
    }

    const credentials = this.config.shopifyOAuthCredentials();
    if (credentials === null) {
      throw new ShopifyNotConfiguredError(
        'Identifiants Shopify absents — fournissez SHOPIFY_ADMIN_TOKEN, ou la ' +
          'paire SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET (app Dev Dashboard).',
      );
    }

    const reusable = this.reusableToken(shopDomain);
    if (reusable !== null) {
      return reusable;
    }

    const fresh = await this.exchange(shopDomain, credentials);
    this.cached = fresh;
    return fresh.value;
  }

  /** Le jeton en cache s'il concerne la même boutique et n'est pas (bientôt) expiré. */
  private reusableToken(shopDomain: string): string | null {
    const cached = this.cached;
    if (cached === null || cached.domain !== shopDomain) {
      return null;
    }
    if (cached.expiresAt - REFRESH_MARGIN_MS <= Date.now()) {
      return null;
    }
    return cached.value;
  }

  /** Échange client credentials → jeton d'accès contre la boutique. */
  private async exchange(
    shopDomain: string,
    credentials: ShopifyOAuthCredentials,
  ): Promise<CachedToken> {
    const url = `https://${shopDomain}/admin/oauth/access_token`;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    });

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch (cause) {
      throw new ShopifyTransportError(
        "Serveur d'autorisation Shopify injoignable.",
        cause,
      );
    }

    if (!response.ok) {
      const detail = await grantErrorDetail(response);
      throw new ShopifyTransportError(
        `Échange de jeton refusé (${response.status} ${response.statusText})${detail}.`,
      );
    }

    const payload = (await response.json()) as TokenGrantResponse;
    if (
      typeof payload.access_token !== 'string' ||
      payload.access_token === ''
    ) {
      throw new ShopifyTransportError("Réponse d'échange sans access_token.");
    }

    const ttlSeconds =
      typeof payload.expires_in === 'number' && payload.expires_in > 0
        ? payload.expires_in
        : FALLBACK_TTL_SECONDS;

    return {
      domain: shopDomain,
      value: payload.access_token,
      expiresAt: Date.now() + ttlSeconds * 1000,
    };
  }
}

/** Réponse d'échec du grant OAuth — Shopify renvoie ce couple en JSON sur un 4xx. */
interface GrantError {
  readonly error?: string;
  readonly error_description?: string;
}

/**
 * Motif lisible tiré du corps d'erreur du grant : le `error`/`error_description`
 * JSON quand il est là (ex. `invalid_client`, `invalid_request`), sinon le texte brut
 * tronqué. C'est ce détail — pas le seul code HTTP — qui dit *pourquoi* le 400.
 */
async function grantErrorDetail(response: Response): Promise<string> {
  const raw = await response.text().catch(() => '');
  if (raw.trim() === '') {
    return '';
  }
  const parsed = parseGrantError(raw);
  if (parsed !== null) {
    const parts = [parsed.error, parsed.error_description].filter(
      (part): part is string => typeof part === 'string' && part !== '',
    );
    if (parts.length > 0) {
      return ` — ${parts.join(' : ')}`;
    }
  }
  return ` — ${raw.slice(0, 200)}`;
}

function parseGrantError(raw: string): GrantError | null {
  try {
    return JSON.parse(raw) as GrantError;
  } catch {
    return null;
  }
}
