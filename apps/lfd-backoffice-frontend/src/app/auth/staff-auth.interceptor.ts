import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';
import { StaffToken } from './staff-token';

/**
 * Attache le **jeton staff** à tout appel vers notre backend.
 *
 * Avant, chaque service portait sa propre méthode `staffOptions()` : six l'avaient
 * écrite, sept l'avaient oubliée. Ces sept-là appelaient `/admin/*` **sans aucun
 * en-tête** et ne passaient que par la grâce du bypass de dev — la panne aurait
 * été découverte en production, sur la surface staff. Un service ne peut pas
 * oublier ce qu'il n'a pas à écrire.
 *
 * **Ne vise que notre API.** Un jeton n'est pas une décoration : l'envoyer à un
 * tiers, c'est le lui offrir. Le préfixe d'origine est le critère, et rien
 * d'autre — pas un morceau de chemin, qu'une URL étrangère pourrait imiter.
 *
 * Sans jeton disponible, la requête part **telle quelle**. C'est le backend qui
 * refuse : le front n'a jamais été le mur, et l'échouer ici ne ferait que
 * déplacer le message d'erreur loin de sa cause.
 */
export const staffAuthInterceptor: HttpInterceptorFn = (request, next) => {
  if (B2B_API_BASE === '' || !request.url.startsWith(B2B_API_BASE)) {
    return next(request);
  }
  const token = inject(StaffToken);
  return from(token.bearer()).pipe(
    switchMap((bearer) =>
      next(
        bearer === null
          ? request
          : request.clone({ setHeaders: { Authorization: `Bearer ${bearer}` } }),
      ),
    ),
  );
};
