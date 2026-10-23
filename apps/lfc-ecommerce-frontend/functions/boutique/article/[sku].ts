/**
 * **Pages Function `GET /boutique/article/<sku>`** — l'`index.html` de la SPA,
 * avec dans son `<head>` le titre, la description, l'adresse canonique et
 * l'Open Graph de l'article (Hugo, 2026-10-23 : une fiche se référence et se
 * partage, et un robot ne lit pas ce que l'app écrit après coup).
 *
 * Adaptateur mince autour de `piece-page.render.ts` : lire le catalogue
 * public, lire l'`index.html` statique par `env.ASSETS`, poser les en-têtes.
 *
 * - article public → 200, balises injectées ;
 * - absent (retiré, inconnu, réservé aux pros) → 404 + `noindex` ; la SPA
 *   affiche « Cet article n'est plus disponible » ;
 * - API en panne ou lente (> {@link CATALOGUE_TIMEOUT_MS}) → l'`index.html`
 *   INTACT en 200 : la page ne casse jamais pour un en-tête manqué.
 *
 * **L'origine de l'API** : `apiBaseUrl` du fichier généré depuis la variable
 * de dépôt `LFD_API_URL`, comme `functions/confidentialite.ts` — une seule
 * source, pas une variable Pages de plus.
 *
 * 🔴 **Anonyme, toujours** : ni jeton, ni cookie, ni `?audience=` relayés. Un
 * article réservé aux pros n'est pas servi par cette route, ses balises ne
 * peuvent pas fuiter.
 */
import { AUTH_ENV } from '../../../src/app/auth/auth.env.generated';
import {
  findPublicPiece,
  renderMissingPieceHead,
  renderPieceHead,
  type PublicPiece,
} from '../../../src/app/client/shop/piece-page/piece-page.render';

/** Au-delà, on sert la page sans en-tête plutôt que de faire attendre. */
export const CATALOGUE_TIMEOUT_MS = 1500;

/** Un article renommé se voit en cinq minutes ; un robot reçoit l'ancien pendant la revalidation. */
export const FOUND_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600';

/** Un article absent peut revenir (republié) : court, sans revalidation tardive. */
export const MISSING_CACHE_CONTROL = 'public, max-age=60';

/** Une panne ne se garde pas en cache : la suivante doit pouvoir réussir. */
export const FAILURE_CACHE_CONTROL = 'no-store';

/** Ce que Pages fournit à la Function — décrit ici, sans `@cloudflare/workers-types`. */
export interface PieceFunctionContext {
  readonly request: Request;
  readonly env: { readonly ASSETS: { fetch(input: Request | string): Promise<Response> } };
}

type CatalogueReading =
  { readonly kind: 'read'; readonly piece: PublicPiece | null } | { readonly kind: 'failed' };

export async function onRequestGet(context: PieceFunctionContext): Promise<Response> {
  const origin = new URL(context.request.url).origin;
  const index = await context.env.ASSETS.fetch(new Request(`${origin}/`));
  if (!index.ok) {
    return index;
  }
  const html = await index.text();
  const sku = skuOf(new URL(context.request.url).pathname);
  const reading = sku === null ? { kind: 'read' as const, piece: null } : await readPiece(sku);
  if (reading.kind === 'failed') {
    return page(html, 200, FAILURE_CACHE_CONTROL);
  }
  if (reading.piece === null) {
    return page(renderMissingPieceHead(html), 404, MISSING_CACHE_CONTROL);
  }
  return page(renderPieceHead(html, reading.piece, origin), 200, FOUND_CACHE_CONTROL);
}

async function readPiece(sku: string): Promise<CatalogueReading> {
  try {
    const response = await fetch(`${AUTH_ENV.apiBaseUrl}/shop/catalogue`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(CATALOGUE_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[boutique/article] catalogue en ${response.status}, en-tête non posé`);
      return { kind: 'failed' };
    }
    const payload: unknown = await response.json();
    return { kind: 'read', piece: findPublicPiece(payload, sku) };
  } catch (error) {
    // Délai dépassé, API injoignable, réponse qui n'est pas du JSON : page intacte.
    console.warn(`[boutique/article] catalogue illisible, en-tête non posé : ${String(error)}`);
    return { kind: 'failed' };
  }
}

/**
 * Le SKU, décodé UNE fois depuis le chemin brut — pas depuis `params`, dont
 * l'état d'encodage n'est pas documenté par Pages ; `null` si mal encodé.
 */
function skuOf(pathname: string): string | null {
  const raw = pathname.replace(/\/+$/, '').split('/').pop();
  if (raw === undefined || raw === '') {
    return null;
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function page(html: string, status: 200 | 404, cacheControl: string): Response {
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': cacheControl,
      'x-content-type-options': 'nosniff',
    },
  });
}
