import type { NextFunction, Request, Response } from "express";

import { runWithRequestContext } from "./request-context.store.js";
import { extractOrCreateTraceId } from "./trace-context.js";

/**
 * Middleware d'**ingress** : pose le `RequestContext` autour de toute la requête.
 *
 * Branché en `app.use(...)` **tout premier** (`main.ts`), avant helmet et avant
 * les guards Nest — comme ça logs, journal et filtre d'erreur voient le contexte,
 * même sur une requête qui échoue tôt. Middleware Express **simple** (pas un
 * provider Nest) : il ne dépend d'aucune injection, seulement du store ALS, et
 * évite ainsi les pièges de résolution de routes de `MiddlewareConsumer`.
 *
 * `now` est **figé ici** (le temps métier de la requête). L'en-tête
 * `x-lfc-request-time` posé par la gateway n'est **volontairement pas** lu comme
 * `now` : un temps propagé ne sert qu'à l'observabilité (latence), jamais à
 * écrire du métier — dérive d'horloges + risque de spoof.
 */
export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const traceId = extractOrCreateTraceId(req.headers["traceparent"]);
  const now = new Date();
  runWithRequestContext({ now, traceId }, () => {
    next();
  });
}
