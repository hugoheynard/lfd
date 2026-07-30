import { Catch, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";

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
 */
@Catch()
export class AppErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    const appError = exception instanceof AppError ? exception : mapPersistenceError(exception);
    if (appError !== null) {
      this.sendAppError(appError, response);
      return;
    }

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(bodyOf(exception));
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

    response.status(status).json({
      code: error.code,
      message:
        error.category === "technical" ? "Une erreur technique est survenue." : error.message,
    });
  }
}

/** Corps d'une `HttpException` — objet tel quel, ou enveloppe si c'est une chaîne. */
function bodyOf(exception: HttpException): object {
  const payload = exception.getResponse();
  return typeof payload === "string" ? { message: payload } : payload;
}
