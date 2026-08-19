import { inject } from '@angular/core';
import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { catchError, from, switchMap, throwError } from 'rxjs';

import { API_BASE_URL } from './api';
import { SuiteEmbed } from '../suite-embed/suite-embed';

/**
 * L'audience du jeton demandé au shell : celle de la surface **staff** de l'API,
 * la même que le back-office. Le référentiel a longtemps eu la sienne ; il n'en
 * a plus besoin depuis qu'il est servi par le même backend, derrière le même
 * mur — et une audience de moins, c'est une porte de moins à tenir.
 */
const STAFF_AUDIENCE = 'b2bAdmin';

/**
 * Attache le jeton **staff** aux appels d'API.
 *
 * Le référentiel n'en envoyait aucun : ses routes étaient ouvertes, et cet
 * intercepteur est la moitié front du mur qui les ferme. Le jeton vient du
 * shell par le bridge — l'app embarquée n'a pas de session à elle, c'est tout
 * l'intérêt d'un login unique.
 *
 * Deux prudences qui valent d'être dites :
 *
 * - **seuls les appels à l'API** sont estampillés. Un jeton d'accès posé sur
 *   une requête vers un tiers est une fuite, pas une commodité ;
 * - le jeton est **mémorisé**, et **oublié sur un 401**. Sans mémoire, chaque
 *   requête coûterait un aller-retour `postMessage` ; sans l'oubli, une
 *   expiration condamnerait l'onglet jusqu'au rechargement.
 *
 * Hors contexte embarqué (app ouverte seule, en dev), le shell ne répond pas :
 * la requête part **sans** jeton, et c'est le backend qui tranche — en local,
 * son bypass de développement ; ailleurs, un 401 franc.
 */
let cached: Promise<string | null> | null = null;

export const staffTokenInterceptor: HttpInterceptorFn = (request, next) => {
  const apiBase = inject(API_BASE_URL);
  const embed = inject(SuiteEmbed);

  if (!request.url.startsWith(apiBase)) {
    return next(request);
  }

  cached ??= embed.requestToken(STAFF_AUDIENCE);

  return from(cached).pipe(
    switchMap((token) =>
      next(
        token === null
          ? request
          : request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }),
      ),
    ),
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        cached = null;
      }
      return throwError(() => error);
    }),
  );
};

/** Oublie le jeton mémorisé — pour les tests, qui doivent partir d'un état neuf. */
export function resetStaffToken(): void {
  cached = null;
}
