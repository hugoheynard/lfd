import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { WORKSPACE_HEADER } from '@lfd/contracts';

import { AUTH_CONFIG } from '../auth/auth.config';
import { ClientWorkspace } from './client-workspace.service';

/**
 * **Déclare l'espace de travail** sur chaque requête vers NOTRE API.
 *
 * Trois retenues, et chacune ferme un défaut précis :
 *
 * - **vers l'API seulement** — l'en-tête dit à quelle société la personne est
 *   rattachée. Auth0, Stripe ou un CDN n'ont pas à le lire, et un en-tête
 *   inconnu déclenche un pré-vol CORS chez un tiers qui peut le refuser ;
 * - **seulement quand l'espace est connu** — avant `/me`, ne rien poser laisse
 *   le serveur appliquer sa résolution d'avant, ce qui vaut mieux qu'un espace
 *   deviné. Les lecteurs par espace attendent de toute façon (plan D6) ;
 * - **jamais par-dessus un en-tête déjà posé** — l'écriture du panier pose
 *   l'espace CAPTURÉ au geste. Le remplacer par l'espace lu à l'envoi écrirait,
 *   après une bascule pendant l'accalmie, les lignes d'un espace dans l'autre.
 *
 * Rendu serveur : aucune lecture de `window` ici, et `ClientWorkspace` rend
 * `null` tant qu'aucun compte n'est lu — l'en-tête n'y part donc pas.
 */
export const workspaceInterceptor: HttpInterceptorFn = (request, next) =>
  workspaceInterceptorFor(AUTH_CONFIG.apiBaseUrl)(request, next);

/**
 * Le même intercepteur, pour une racine d'API donnée.
 *
 * 🔴 **Exporté pour les suites, et c'est une correction.** La racine vient de
 * `auth.env.generated.ts`, fabriqué depuis l'environnement : présente dans le
 * `.env` d'un poste, VIDE en CI. La suite lisait `AUTH_CONFIG.apiBaseUrl` —
 * verte partout où un `.env` existe, rouge en CI, où une racine vide ne vise
 * rien (constaté le 2026-09-15, run CI `35023149500`). Une suite qui dépend du
 * `.env` du poste ne prouve rien.
 */
export function workspaceInterceptorFor(apiBaseUrl: string): HttpInterceptorFn {
  return (request, next) => {
    if (!targetsApi(request.url, apiBaseUrl) || request.headers.has(WORKSPACE_HEADER)) {
      return next(request);
    }
    const workspace = inject(ClientWorkspace).current();
    if (workspace === null) {
      return next(request);
    }
    return next(request.clone({ setHeaders: { [WORKSPACE_HEADER]: workspace } }));
  };
}

/**
 * La requête vise-t-elle l'API ? Sur une **frontière de chemin** : un simple
 * `startsWith` prendrait `https://api.exemple.fr.ailleurs.net` pour la nôtre.
 * Une racine vide ne désigne rien — mieux vaut ne rien poser que tout viser.
 */
export function targetsApi(url: string, apiBaseUrl: string): boolean {
  const base = apiBaseUrl.replace(/\/+$/, '');
  if (base === '') {
    return false;
  }
  return url === base || url.startsWith(`${base}/`) || url.startsWith(`${base}?`);
}
