import { Catch, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";

import { currentRequestContext } from "../../infra/context/request-context.store.js";
import { AppError, ResourceNotFoundError, type ErrorCategory } from "../errors/app-error.js";
import { mapPersistenceError } from "../errors/persistence-errors.js";

/**
 * Traduction des catégories d'erreur en statuts HTTP.
 *
 * C'est **le seul endroit** du système qui connaît à la fois le domaine et HTTP. Les
 * classes d'erreur, elles, n'ont aucune dépendance au transport — un cron ou un import
 * CSV lève exactement les mêmes.
 */
const STATUS_BY_CATEGORY: Record<ErrorCategory, HttpStatus> = {
  domain: HttpStatus.BAD_REQUEST,
  business: HttpStatus.CONFLICT,
  authorization: HttpStatus.FORBIDDEN,
  technical: HttpStatus.INTERNAL_SERVER_ERROR,
};

/**
 * Filtre **attrape-tout** : aucune erreur ne sort brute.
 *
 * Trois familles, dans cet ordre :
 * 1. `AppError` — nos erreurs catégorisées (domain/business/authorization/technical),
 *    ou une erreur **Prisma** rabattue sur une `AppError` de persistance (une erreur
 *    d'infra ne fuit jamais sa stack ni ses noms de colonnes).
 * 2. `HttpException` de Nest (401 du guard, 404 de route…) — on laisse passer son statut.
 * 3. Tout le reste — filet technique 500, tracé, détail masqué.
 *
 * **Hors production**, les 500 (technical + inconnues) portent en plus un champ
 * `detail` avec la cause réelle — pour la lire dans l'onglet réseau sans ouvrir
 * les logs serveur. Le `message` reste neutre dans les deux cas : `detail` est un
 * ajout, pas un remplacement, et il est fermé en prod (`exposeDetail=false`).
 */
@Catch()
export class AppErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppErrorFilter.name);

  /** @param exposeDetail joindre le détail technique aux 500 (dev uniquement). */
  constructor(private readonly exposeDetail: boolean = false) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    const appError = exception instanceof AppError ? exception : mapPersistenceError(exception);
    if (appError !== null) {
      this.sendAppError(appError, response);
      return;
    }

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json({ ...bodyOf(exception), ...requestIdField() });
      return;
    }

    // Inconnue : jamais de fuite. On trace le détail, on renvoie un message neutre.
    this.logger.error(
      "internal.unexpected — erreur non catégorisée",
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: "internal.unexpected",
      message: "Une erreur technique est survenue.",
      ...this.detailOf(exception),
      ...requestIdField(),
    });
  }

  private sendAppError(error: AppError, response: Response): void {
    const status =
      error instanceof ResourceNotFoundError
        ? HttpStatus.NOT_FOUND
        : STATUS_BY_CATEGORY[error.category];

    // Une erreur technique est un incident : elle se trace, et son détail ne sort pas.
    if (error.category === "technical") {
      this.logger.error(`${error.code} — ${error.message}`, error.stack);
    }

    const technical = error.category === "technical";
    response.status(status).json({
      code: error.code,
      message: technical ? "Une erreur technique est survenue." : error.message,
      // Les faits publiables sortent MÊME en production, et même sur une erreur
      // technique : ce sont des nombres sans contenu (cf. `PublicErrorFacts`),
      // et sans eux un incident ne laisse rien d'exploitable à qui n'a pas accès
      // aux journaux — ce qui est le cas quand ils sont inatteignables.
      ...error.facts,
      ...(technical ? this.detailOf(error) : {}),
      ...requestIdField(),
    });
  }

  /**
   * Le détail technique à joindre à une 500 — **hors production seulement**. Sa
   * présence ne dépend jamais de l'entrée : en prod c'est toujours `{}`, aucun
   * indice ne sort. On ne renvoie que le message de l'erreur, pas la stack.
   */
  private detailOf(exception: unknown): { detail: string } | Record<string, never> {
    if (!this.exposeDetail) {
      return {};
    }
    const detail = exception instanceof Error ? exception.message : String(exception);
    return { detail };
  }
}

/** Corps d'une `HttpException` — objet tel quel, ou enveloppe si c'est une chaîne. */
function bodyOf(exception: HttpException): object {
  const payload = exception.getResponse();
  return typeof payload === "string" ? { message: payload } : payload;
}

/**
 * Champ `requestId` (le `traceId` de la requête) à joindre à **toute** réponse
 * d'erreur : le client peut le donner au support, qui corrèle logs et journal
 * bout-en-bout. Absent hors requête (jamais atteint via HTTP, mais défensif).
 */
function requestIdField(): { requestId: string } | Record<string, never> {
  const context = currentRequestContext();
  return context !== null ? { requestId: context.traceId } : {};
}
