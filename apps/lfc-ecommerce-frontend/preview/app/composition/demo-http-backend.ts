import {
  HttpErrorResponse,
  HttpHeaders,
  HttpResponse,
  type HttpBackend,
  type HttpEvent,
  type HttpRequest,
} from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { AUTH_CONFIG } from '../../../src/app/auth/auth.config';
import { PREVIEW_WORLD } from '../journeys/preview-world';
import { DEMO_ROUTES, type DemoAnswer, type DemoRequest } from './demo-routes';

/** Le code d'erreur d'une écriture refusée — lu par `httpErrorMessage` comme un refus du serveur. */
export const PREVIEW_READ_ONLY = 'preview.read_only';

/** Une demande que la table ne sert pas, retenue pour les suites de tests. */
export interface UnservedRequest {
  readonly method: string;
  readonly url: string;
}

/**
 * **Le backend HTTP de l'aperçu — il ne sort JAMAIS** (plan
 * `plan-textes-de-la-boutique.md`, §10 B3).
 *
 * Il remplace `HttpBackend` à la composition : toutes les requêtes de la
 * boutique, intercepteurs compris, finissent ici et nulle part ailleurs. Ce
 * n'est pas un filtre devant le réseau — il n'y a pas de réseau derrière.
 *
 * - une lecture de la table (`demo-routes.ts`) répond avec les données du parcours ;
 * - une écriture hors des trois simulées répond `403 preview.read_only` ;
 * - tout le reste répond `404` et est RETENU dans {@link unserved} : une suite
 *   de tests qui le trouve non vide a trouvé une lecture que l'aperçu ne sert pas.
 */
@Injectable()
export class DemoHttpBackend implements HttpBackend {
  private readonly world = inject(PREVIEW_WORLD);
  private readonly unservedRequests: UnservedRequest[] = [];

  /** Les demandes ni servies ni refusées délibérément. */
  get unserved(): readonly UnservedRequest[] {
    return this.unservedRequests;
  }

  handle(request: HttpRequest<unknown>): Observable<HttpEvent<unknown>> {
    return new Observable<HttpEvent<unknown>>((subscriber) => {
      // Asynchrone comme un vrai réseau : un écran qui suppose une réponse
      // synchrone se tromperait ici comme en production.
      const timer = setTimeout(() => {
        const answer = this.answer(request);
        if (answer instanceof HttpResponse) {
          subscriber.next(answer);
          subscriber.complete();
        } else {
          subscriber.error(answer);
        }
      });
      return () => clearTimeout(timer);
    });
  }

  private answer(request: HttpRequest<unknown>): HttpResponse<unknown> | HttpErrorResponse {
    const demo = toDemoRequest(request);
    const route =
      demo === null
        ? undefined
        : DEMO_ROUTES.map((candidate) => ({
            candidate,
            match: candidate.pattern.exec(demo.path),
          })).find(({ candidate, match }) => candidate.method === demo.method && match !== null);
    if (demo !== null && route?.match !== undefined && route.match !== null) {
      return respond(request, route.candidate.answer(demo, route.match, this.world));
    }
    if (request.method !== 'GET') {
      return refuse(request, 403, PREVIEW_READ_ONLY, "Aperçu : rien n'est enregistré.");
    }
    this.unservedRequests.push({ method: request.method, url: request.urlWithParams });
    return refuse(request, 404, 'preview.not_served', "Aperçu : cette lecture n'est pas simulée.");
  }
}

/** Le chemin sous l'API ; `null` pour une adresse hors de l'API — elle n'est jamais servie. */
function toDemoRequest(request: HttpRequest<unknown>): DemoRequest | null {
  const base = AUTH_CONFIG.apiBaseUrl;
  if (!request.url.startsWith(base)) {
    return null;
  }
  const [path = '', query = ''] = request.urlWithParams.slice(base.length).split('?');
  return { method: request.method, path, params: new URLSearchParams(query), body: request.body };
}

function respond(
  request: HttpRequest<unknown>,
  answer: DemoAnswer,
): HttpResponse<unknown> | HttpErrorResponse {
  return answer.status === 200
    ? new HttpResponse({
        status: 200,
        body: answer.body,
        url: request.urlWithParams,
        headers: new HttpHeaders(),
      })
    : refuse(request, 404, 'preview.not_found', `Aperçu : ${answer.reason}.`);
}

function refuse(
  request: HttpRequest<unknown>,
  status: number,
  code: string,
  message: string,
): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    statusText: 'Aperçu',
    url: request.urlWithParams,
    error: { code, message },
  });
}
