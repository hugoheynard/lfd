/**
 * **Pages Function `GET /confidentialite`** — la politique de confidentialité
 * en HTML complet, lisible sans JavaScript (plan
 * `documentation/legal/plan-page-confidentialite.md`, lot P3).
 *
 * Adaptateur mince : lire le document public, confier le rendu à
 * {@link renderPrivacyPage}, poser les en-têtes. Aucune règle ici.
 *
 * **L'origine de l'API** est celle que la boutique compile déjà : `apiBaseUrl`
 * du fichier généré par `scripts/generate-auth-config.mjs` depuis la variable
 * de dépôt `LFD_API_URL`. Une seule source, pas une variable Pages de plus à
 * tenir d'accord à la main. Wrangler l'embarque au déploiement : le fichier
 * doit donc exister à ce moment-là — le workflow le génère avant.
 *
 * Pages sert une Function AVANT les fichiers statiques et `_redirects` : le
 * repli SPA ne voit jamais `/confidentialite`.
 *
 * ⚠️ Aucun `document.createElement`, aucun import Angular : ce code tourne
 * dans le runtime Workers de Pages, pas dans un navigateur.
 */
import { AUTH_ENV } from '../src/app/auth/auth.env.generated';
import {
  privacyPageUnavailable,
  renderPrivacyPage,
  type PrivacyPage,
} from '../src/app/legal/privacy-page/privacy-page.render';

/** Court : un correctif saisi au back-office doit se voir en quelques minutes. */
const SUCCESS_CACHE_CONTROL = 'public, max-age=300';

/** Une panne ne se garde pas en cache : la suivante doit pouvoir réussir. */
const FAILURE_CACHE_CONTROL = 'no-store';

export async function onRequestGet(): Promise<Response> {
  const page = await loadPrivacyPage();
  return new Response(page.html, {
    status: page.status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': page.status === 200 ? SUCCESS_CACHE_CONTROL : FAILURE_CACHE_CONTROL,
      'x-content-type-options': 'nosniff',
    },
  });
}

async function loadPrivacyPage(): Promise<PrivacyPage> {
  try {
    const response = await fetch(`${AUTH_ENV.apiBaseUrl}/content/legal/privacy`, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      return privacyPageUnavailable();
    }
    const payload: unknown = await response.json();
    return renderPrivacyPage(payload);
  } catch {
    // API injoignable ou réponse qui n'est pas du JSON : même page, même 503.
    return privacyPageUnavailable();
  }
}
